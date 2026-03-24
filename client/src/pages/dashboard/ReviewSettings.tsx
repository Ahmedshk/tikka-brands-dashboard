import { useState, useEffect, useCallback, useRef } from "react";
import toast from "react-hot-toast";
import { Layout } from "../../components/common/Layout";
import { Spinner } from "../../components/common/Spinner";
import { RoleMappingSection } from "../../components/ReviewSettings/RoleMappingSection";
import {
  QuestionnaireBuilder,
  type QuestionnaireBuilderHandle,
} from "../../components/ReviewSettings/QuestionnaireBuilder";
import { reviewService } from "../../services/review.service";
import api from "../../services/api.service";
import type { ReviewSettings as ReviewSettingsType, Question } from "../../types/review.types";
import AdminAndSettingsIcon from "@assets/icons/admin_and_settings.svg?react";

interface RoleOption {
  _id: string;
  name: string;
}

function extractRoleId(item: string | { _id: string }): string {
  return typeof item === "string" ? item : item._id;
}

export const ReviewSettings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [employeeRoleIds, setEmployeeRoleIds] = useState<string[]>([]);
  const [managerRoleIds, setManagerRoleIds] = useState<string[]>([]);
  const [directorRoleIds, setDirectorRoleIds] = useState<string[]>([]);
  const [selfReviewQuestions, setSelfReviewQuestions] = useState<Question[]>([]);
  const [managerReviewQuestions, setManagerReviewQuestions] = useState<Question[]>([]);
  const [checkInQuestions, setCheckInQuestions] = useState<Question[]>([]);

  const selfQuestionnaireRef = useRef<QuestionnaireBuilderHandle>(null);
  const managerQuestionnaireRef = useRef<QuestionnaireBuilderHandle>(null);
  const checkInQuestionnaireRef = useRef<QuestionnaireBuilderHandle>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsRes, rolesRes] = await Promise.all([
        reviewService.getSettings(),
        api.get<{ data: RoleOption[] }>("/roles"),
      ]);
      const allRoles: RoleOption[] = (rolesRes.data as unknown as { success: boolean; data: { roles: RoleOption[] } }).data?.roles ?? [];
      setRoles(allRoles);

      if (settingsRes) {
        setEmployeeRoleIds(settingsRes.employeeRoleIds.map(extractRoleId));
        setManagerRoleIds(settingsRes.managerRoleIds.map(extractRoleId));
        setDirectorRoleIds(settingsRes.directorRoleIds.map(extractRoleId));
        setSelfReviewQuestions(settingsRes.selfReviewQuestionnaire);
        setManagerReviewQuestions(settingsRes.managerReviewQuestionnaire);
        setCheckInQuestions(settingsRes.checkInQuestionnaire);
      }
    } catch {
      toast.error("Failed to load review settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const selfReviewQuestionnaire =
        (await selfQuestionnaireRef.current?.flushPendingUploads()) ?? selfReviewQuestions;
      const managerReviewQuestionnaire =
        (await managerQuestionnaireRef.current?.flushPendingUploads()) ?? managerReviewQuestions;
      const checkInQuestionnaire =
        (await checkInQuestionnaireRef.current?.flushPendingUploads()) ?? checkInQuestions;

      const payload: Partial<ReviewSettingsType> = {
        employeeRoleIds,
        managerRoleIds,
        directorRoleIds,
        selfReviewQuestionnaire,
        managerReviewQuestionnaire,
        checkInQuestionnaire,
      };
      const saved = await reviewService.updateSettings(payload);
      if (saved) {
        setSelfReviewQuestions(saved.selfReviewQuestionnaire);
        setManagerReviewQuestions(saved.managerReviewQuestionnaire);
        setCheckInQuestions(saved.checkInQuestionnaire);
      }
      toast.success("Review settings saved");
    } catch {
      toast.error("Failed to save review settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout>
      <div className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <h2 className="flex items-center gap-2 text-base md:text-lg 2xl:text-xl font-semibold text-primary">
            <AdminAndSettingsIcon
              className="w-4 h-4 md:w-5 md:h-5 2xl:w-6 2xl:h-6 text-primary"
              aria-hidden
            />
            Review Settings
          </h2>
        </div>

        <div className="bg-card-background rounded-xl overflow-hidden">
          <div className="h-4 rounded-t-xl bg-primary" aria-hidden />
          <div className="p-6">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 gap-4 text-primary">
                <Spinner size="xl" className="text-button-primary" />
                <span className="text-sm">Loading settings...</span>
              </div>
            ) : (
              <div className="space-y-8">
                <RoleMappingSection
                  roles={roles}
                  employeeRoleIds={employeeRoleIds}
                  managerRoleIds={managerRoleIds}
                  directorRoleIds={directorRoleIds}
                  onEmployeeChange={setEmployeeRoleIds}
                  onManagerChange={setManagerRoleIds}
                  onDirectorChange={setDirectorRoleIds}
                />

                <hr className="border-gray-200" />

                <QuestionnaireBuilder
                  ref={selfQuestionnaireRef}
                  title="Self-Review Questionnaire"
                  questions={selfReviewQuestions}
                  onChange={setSelfReviewQuestions}
                />

                <QuestionnaireBuilder
                  ref={managerQuestionnaireRef}
                  title="Manager Review Questionnaire"
                  questions={managerReviewQuestions}
                  onChange={setManagerReviewQuestions}
                />

                <QuestionnaireBuilder
                  ref={checkInQuestionnaireRef}
                  title="30/60 Day Check-in Questionnaire"
                  questions={checkInQuestions}
                  onChange={setCheckInQuestions}
                />

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="px-4 py-3 bg-button-primary text-white rounded-xl text-xs md:text-sm 2xl:text-base font-medium hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
                  >
                    {saving ? "Saving..." : "Save Settings"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
};
