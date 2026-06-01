import { useState, useEffect, useCallback, useMemo } from "react";
import toast from "react-hot-toast";
import { Layout } from "../../components/common/Layout";
import { Spinner } from "../../components/common/Spinner";
import { UnsavedChangesBar } from "../../components/common/UnsavedChangesBar";
import { SystemRulesSection } from "../../components/DisciplinarySettings/SystemRulesSection";
import { PolicySectionsBuilder } from "../../components/DisciplinarySettings/PolicySectionsBuilder";
import { ImmediateTerminationBuilder } from "../../components/DisciplinarySettings/ImmediateTerminationBuilder";
import { GuidelinesBuilder } from "../../components/DisciplinarySettings/GuidelinesBuilder";
import { ConfirmDialog } from "../../components/modal/ConfirmDialog";
import { useUnsavedChangesNavigationGuard } from "../../hooks/useUnsavedChangesNavigationGuard";
import {
  disciplinarySettingsService,
  type DisciplinaryPolicySection,
  type ImmediateTerminationPolicy,
  type DisciplineGuideline,
} from "../../services/disciplinarySettings.service";
import { stableJsonEqual } from "../../utils/settingsDirtyStateHelpers";
import AdminAndSettingsIcon from "@assets/icons/admin_and_settings.svg?react";

function sortDisciplineGuidelinesByThreshold(
  list: DisciplineGuideline[],
): DisciplineGuideline[] {
  return [...list].sort((a, b) => a.pointThreshold - b.pointThreshold);
}

interface DisciplinarySnapshot {
  rollingPeriodDays: number;
  pointsToTermination: number;
  policySections: DisciplinaryPolicySection[];
  immediateTerminationPolicies: ImmediateTerminationPolicy[];
  disciplineGuidelines: DisciplineGuideline[];
}

function buildSnapshot(
  rollingPeriodDays: number,
  pointsToTermination: number,
  policySections: DisciplinaryPolicySection[],
  immediateTerminationPolicies: ImmediateTerminationPolicy[],
  disciplineGuidelines: DisciplineGuideline[],
): DisciplinarySnapshot {
  return {
    rollingPeriodDays,
    pointsToTermination,
    policySections,
    immediateTerminationPolicies,
    disciplineGuidelines: sortDisciplineGuidelinesByThreshold(disciplineGuidelines),
  };
}

export const DisciplinarySettings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [rollingPeriodDays, setRollingPeriodDays] = useState(90);
  const [pointsToTermination, setPointsToTermination] = useState(15);
  const [policySections, setPolicySections] = useState<
    DisciplinaryPolicySection[]
  >([]);
  const [immediateTerminationPolicies, setImmediateTerminationPolicies] =
    useState<ImmediateTerminationPolicy[]>([]);
  const [disciplineGuidelines, setDisciplineGuidelines] = useState<
    DisciplineGuideline[]
  >([]);
  const [savedSnapshot, setSavedSnapshot] = useState<DisciplinarySnapshot | null>(
    null,
  );

  const currentSnapshot = useMemo(
    () =>
      buildSnapshot(
        rollingPeriodDays,
        pointsToTermination,
        policySections,
        immediateTerminationPolicies,
        disciplineGuidelines,
      ),
    [
      rollingPeriodDays,
      pointsToTermination,
      policySections,
      immediateTerminationPolicies,
      disciplineGuidelines,
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
      const settings = await disciplinarySettingsService.getSettings();
      if (settings) {
        setRollingPeriodDays(settings.rollingPeriodDays);
        setPointsToTermination(settings.pointsToTermination);
        setPolicySections(settings.policySections);
        setImmediateTerminationPolicies(
          settings.immediateTerminationPolicies,
        );
        setDisciplineGuidelines(settings.disciplineGuidelines);
        setSavedSnapshot(
          buildSnapshot(
            settings.rollingPeriodDays,
            settings.pointsToTermination,
            settings.policySections,
            settings.immediateTerminationPolicies,
            settings.disciplineGuidelines,
          ),
        );
      }
    } catch {
      toast.error("Failed to load disciplinary settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDiscard = useCallback(() => {
    if (!savedSnapshot) return;
    setRollingPeriodDays(savedSnapshot.rollingPeriodDays);
    setPointsToTermination(savedSnapshot.pointsToTermination);
    setPolicySections(savedSnapshot.policySections);
    setImmediateTerminationPolicies(savedSnapshot.immediateTerminationPolicies);
    setDisciplineGuidelines(savedSnapshot.disciplineGuidelines);
  }, [savedSnapshot]);

  const handleSave = async () => {
    if (rollingPeriodDays < 1) {
      toast.error("Rolling period must be at least 1 day");
      return;
    }
    if (pointsToTermination < 1) {
      toast.error("Points to termination must be at least 1");
      return;
    }

    setSaving(true);
    try {
      const sortedGuidelines =
        sortDisciplineGuidelinesByThreshold(disciplineGuidelines);
      const saved = await disciplinarySettingsService.updateSettings({
        rollingPeriodDays,
        pointsToTermination,
        policySections,
        immediateTerminationPolicies,
        disciplineGuidelines: sortedGuidelines,
      });
      setPolicySections(saved.policySections);
      setImmediateTerminationPolicies(saved.immediateTerminationPolicies);
      setDisciplineGuidelines(
        sortDisciplineGuidelinesByThreshold(saved.disciplineGuidelines),
      );
      setSavedSnapshot(
        buildSnapshot(
          saved.rollingPeriodDays,
          saved.pointsToTermination,
          saved.policySections,
          saved.immediateTerminationPolicies,
          saved.disciplineGuidelines,
        ),
      );
      toast.success("Disciplinary settings saved");
    } catch {
      toast.error("Failed to save disciplinary settings");
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
            Disciplinary Settings
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
                <SystemRulesSection
                  rollingPeriodDays={rollingPeriodDays}
                  pointsToTermination={pointsToTermination}
                  onRollingPeriodChange={setRollingPeriodDays}
                  onPointsToTerminationChange={setPointsToTermination}
                />

                <hr className="border-gray-200" />

                <PolicySectionsBuilder
                  sections={policySections}
                  onChange={setPolicySections}
                />

                <hr className="border-gray-200" />

                <ImmediateTerminationBuilder
                  policies={immediateTerminationPolicies}
                  onChange={setImmediateTerminationPolicies}
                />

                <hr className="border-gray-200" />

                <GuidelinesBuilder
                  guidelines={disciplineGuidelines}
                  onChange={setDisciplineGuidelines}
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
        message="Unsaved disciplinary settings will be lost if you leave."
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
