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
import {
  buildDisciplinarySettingsSnapshot,
  DEFAULT_DISCIPLINARY_POINTS_TO_TERMINATION,
  DEFAULT_DISCIPLINARY_ROLLING_PERIOD_DAYS,
  EMPTY_DISCIPLINARY_SETTINGS_SNAPSHOT,
  sortDisciplineGuidelinesByThreshold,
  type DisciplinarySettingsSnapshot,
} from "../../utils/disciplinarySettingsSnapshotHelpers";
import AdminAndSettingsIcon from "@assets/icons/admin_and_settings.svg?react";

export const DisciplinarySettings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [rollingPeriodDays, setRollingPeriodDays] = useState(
    DEFAULT_DISCIPLINARY_ROLLING_PERIOD_DAYS,
  );
  const [pointsToTermination, setPointsToTermination] = useState(
    DEFAULT_DISCIPLINARY_POINTS_TO_TERMINATION,
  );
  const [policySections, setPolicySections] = useState<DisciplinaryPolicySection[]>(
    EMPTY_DISCIPLINARY_SETTINGS_SNAPSHOT.policySections,
  );
  const [immediateTerminationPolicies, setImmediateTerminationPolicies] = useState<
    ImmediateTerminationPolicy[]
  >(EMPTY_DISCIPLINARY_SETTINGS_SNAPSHOT.immediateTerminationPolicies);
  const [disciplineGuidelines, setDisciplineGuidelines] = useState<DisciplineGuideline[]>(
    EMPTY_DISCIPLINARY_SETTINGS_SNAPSHOT.disciplineGuidelines,
  );
  const [savedSnapshot, setSavedSnapshot] = useState<DisciplinarySettingsSnapshot | null>(
    null,
  );

  const currentSnapshot = useMemo(
    () =>
      buildDisciplinarySettingsSnapshot(
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
      const rolling =
        settings?.rollingPeriodDays ?? DEFAULT_DISCIPLINARY_ROLLING_PERIOD_DAYS;
      const points =
        settings?.pointsToTermination ?? DEFAULT_DISCIPLINARY_POINTS_TO_TERMINATION;
      const sections = settings?.policySections ?? [];
      const immediate = settings?.immediateTerminationPolicies ?? [];
      const guidelines = settings?.disciplineGuidelines ?? [];

      setRollingPeriodDays(rolling);
      setPointsToTermination(points);
      setPolicySections(sections);
      setImmediateTerminationPolicies(immediate);
      setDisciplineGuidelines(guidelines);
      setSavedSnapshot(
        buildDisciplinarySettingsSnapshot(
          rolling,
          points,
          sections,
          immediate,
          guidelines,
        ),
      );
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
    setPolicySections(structuredClone(savedSnapshot.policySections));
    setImmediateTerminationPolicies(
      structuredClone(savedSnapshot.immediateTerminationPolicies),
    );
    setDisciplineGuidelines(structuredClone(savedSnapshot.disciplineGuidelines));
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
        buildDisciplinarySettingsSnapshot(
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
