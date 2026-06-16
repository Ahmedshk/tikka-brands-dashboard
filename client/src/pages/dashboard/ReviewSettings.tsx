import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import toast from "react-hot-toast";
import { Layout } from "../../components/common/Layout";
import { Spinner } from "../../components/common/Spinner";
import { UnsavedChangesBar } from "../../components/common/UnsavedChangesBar";
import { RoleMappingSection } from "../../components/ReviewSettings/RoleMappingSection";
import {
  QuestionnaireBuilder,
  type QuestionnaireBuilderHandle,
} from "../../components/ReviewSettings/QuestionnaireBuilder";
import { ConfirmDialog } from "../../components/modal/ConfirmDialog";
import { useUnsavedChangesNavigationGuard } from "../../hooks/useUnsavedChangesNavigationGuard";
import { reviewService } from "../../services/review.service";
import api from "../../services/api.service";
import type { ReviewSettings as ReviewSettingsType } from "../../types/review.types";
import { stableJsonEqual } from "../../utils/settingsDirtyStateHelpers";
import {
  buildReviewSettingsSnapshot,
  extractReviewRoleId,
  EMPTY_REVIEW_SETTINGS_SNAPSHOT,
  type ReviewSettingsSnapshot,
} from "../../utils/reviewSettingsSnapshotHelpers";
import AdminAndSettingsIcon from "@assets/icons/admin_and_settings.svg?react";

interface RoleOption {
  _id: string;
  name: string;
}

export const ReviewSettings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [employeeRoleIds, setEmployeeRoleIds] = useState<string[]>([]);
  const [managerRoleIds, setManagerRoleIds] = useState<string[]>([]);
  const [directorRoleIds, setDirectorRoleIds] = useState<string[]>([]);
  const [selfReviewQuestions, setSelfReviewQuestions] = useState(
    EMPTY_REVIEW_SETTINGS_SNAPSHOT.selfReviewQuestions,
  );
  const [managerReviewQuestions, setManagerReviewQuestions] = useState(
    EMPTY_REVIEW_SETTINGS_SNAPSHOT.managerReviewQuestions,
  );
  const [checkInQuestions, setCheckInQuestions] = useState(
    EMPTY_REVIEW_SETTINGS_SNAPSHOT.checkInQuestions,
  );
  const [savedSnapshot, setSavedSnapshot] = useState<ReviewSettingsSnapshot | null>(
    null,
  );

  const selfQuestionnaireRef = useRef<QuestionnaireBuilderHandle>(null);
  const managerQuestionnaireRef = useRef<QuestionnaireBuilderHandle>(null);
  const checkInQuestionnaireRef = useRef<QuestionnaireBuilderHandle>(null);

  const currentSnapshot = useMemo(
    () =>
      buildReviewSettingsSnapshot(
        employeeRoleIds,
        managerRoleIds,
        directorRoleIds,
        selfReviewQuestions,
        managerReviewQuestions,
        checkInQuestions,
      ),
    [
      employeeRoleIds,
      managerRoleIds,
      directorRoleIds,
      selfReviewQuestions,
      managerReviewQuestions,
      checkInQuestions,
    ],
  );

  const hasUnsavedChanges = useMemo(() => {
    if (loading || savedSnapshot == null) return false;
    return !stableJsonEqual(currentSnapshot, savedSnapshot);
  }, [loading, savedSnapshot, currentSnapshot]);

  const blocker = useUnsavedChangesNavigationGuard(hasUnsavedChanges);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsRes, rolesRes] = await Promise.all([
        reviewService.getSettings(),
        api.get<{ data: RoleOption[] }>("/roles"),
      ]);
      const allRoles: RoleOption[] = (rolesRes.data as unknown as { success: boolean; data: { roles: RoleOption[] } }).data?.roles ?? [];
      setRoles(allRoles);

      const employee = (settingsRes?.employeeRoleIds ?? []).map(extractReviewRoleId);
      const manager = (settingsRes?.managerRoleIds ?? []).map(extractReviewRoleId);
      const director = (settingsRes?.directorRoleIds ?? []).map(extractReviewRoleId);
      const selfReview = settingsRes?.selfReviewQuestionnaire ?? [];
      const managerReview = settingsRes?.managerReviewQuestionnaire ?? [];
      const checkIn = settingsRes?.checkInQuestionnaire ?? [];

      setEmployeeRoleIds(employee);
      setManagerRoleIds(manager);
      setDirectorRoleIds(director);
      setSelfReviewQuestions(selfReview);
      setManagerReviewQuestions(managerReview);
      setCheckInQuestions(checkIn);
      setSavedSnapshot(
        buildReviewSettingsSnapshot(
          employee,
          manager,
          director,
          selfReview,
          managerReview,
          checkIn,
        ),
      );
    } catch {
      toast.error("Failed to load review settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDiscard = useCallback(() => {
    if (!savedSnapshot) return;
    setEmployeeRoleIds([...savedSnapshot.employeeRoleIds]);
    setManagerRoleIds([...savedSnapshot.managerRoleIds]);
    setDirectorRoleIds([...savedSnapshot.directorRoleIds]);
    setSelfReviewQuestions(structuredClone(savedSnapshot.selfReviewQuestions));
    setManagerReviewQuestions(structuredClone(savedSnapshot.managerReviewQuestions));
    setCheckInQuestions(structuredClone(savedSnapshot.checkInQuestions));
  }, [savedSnapshot]);

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
      setSelfReviewQuestions(saved.selfReviewQuestionnaire ?? []);
      setManagerReviewQuestions(saved.managerReviewQuestionnaire ?? []);
      setCheckInQuestions(saved.checkInQuestionnaire ?? []);
      setSavedSnapshot(
        buildReviewSettingsSnapshot(
          employeeRoleIds,
          managerRoleIds,
          directorRoleIds,
          saved.selfReviewQuestionnaire ?? [],
          saved.managerReviewQuestionnaire ?? [],
          saved.checkInQuestionnaire ?? [],
        ),
      );
      toast.success("Review settings saved");
    } catch {
      toast.error("Failed to save review settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout>
      <div className={`p-6 ${hasUnsavedChanges ? "pb-24" : ""}`}>
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
              </div>
            )}
          </div>
        </div>
      </div>

      <UnsavedChangesBar
        visible={hasUnsavedChanges}
        onDiscard={handleDiscard}
        onSave={() => void handleSave()}
        saving={saving}
        saveLabel={saving ? "Saving..." : "Save Settings"}
      />

      <ConfirmDialog
        isOpen={blocker.state === "blocked"}
        onClose={() => {
          if (blocker.state === "blocked") blocker.reset();
        }}
        title="Unsaved changes"
        message="Unsaved review settings will be lost if you leave."
        confirmLabel="Leave"
        cancelLabel="Stay"
        variant="danger"
        onConfirm={() => {
          if (blocker.state === "blocked") blocker.proceed();
        }}
      />
    </Layout>
  );
};
