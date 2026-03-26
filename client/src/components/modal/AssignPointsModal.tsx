import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useLayoutEffect,
} from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { Spinner } from '../common/Spinner';
import {
  disciplinarySettingsService,
  type DisciplinarySettings,
} from '../../services/disciplinarySettings.service';
import {
  disciplinaryManagementService,
  type IncidentCreatePayload,
} from '../../services/disciplinaryManagement.service';

interface AssignPointsModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly employeeId: string;
  readonly employeeName: string;
  readonly locationId: string;
  readonly onSuccess: () => void;
}

type Step = 'policies' | 'report';

function autoResizeTextarea(element: HTMLTextAreaElement): void {
  element.style.height = 'auto';
  element.style.height = `${element.scrollHeight}px`;
}

function useAutoResizeTextareaRef(value: string) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    autoResizeTextarea(el);
  }, [value]);
  return ref;
}

interface SelectedPolicy {
  policyId: string;
  sectionId: string;
  title: string;
  description: string;
  points: number;
}

export const AssignPointsModal = ({
  isOpen,
  onClose,
  employeeId,
  employeeName,
  locationId,
  onSuccess,
}: AssignPointsModalProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState<Step>('policies');
  const [settings, setSettings] = useState<DisciplinarySettings | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [selectedPolicies, setSelectedPolicies] = useState<SelectedPolicy[]>([]);
  const [selectedTerminationPolicyId, setSelectedTerminationPolicyId] = useState<string | null>(null);

  const [detailsOfIncident, setDetailsOfIncident] = useState('');
  const [supervisorCommitment, setSupervisorCommitment] = useState('');
  const [supervisorComments, setSupervisorComments] = useState('');
  const [positiveResults, setPositiveResults] = useState('');
  const [negativeConsequences, setNegativeConsequences] = useState('');

  const totalPoints = selectedPolicies.reduce((sum, p) => sum + p.points, 0);
  const isImmediateTermination = selectedTerminationPolicyId !== null;

  const detailsRef = useAutoResizeTextareaRef(detailsOfIncident);
  const commitmentRef = useAutoResizeTextareaRef(supervisorCommitment);
  const commentsRef = useAutoResizeTextareaRef(supervisorComments);
  const positiveRef = useAutoResizeTextareaRef(positiveResults);
  const negativeRef = useAutoResizeTextareaRef(negativeConsequences);

  const fetchSettings = useCallback(async () => {
    setLoadingSettings(true);
    try {
      const data = await disciplinarySettingsService.getSettings();
      setSettings(data);
    } catch {
      toast.error('Failed to load disciplinary policies');
    } finally {
      setLoadingSettings(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchSettings();
      setStep('policies');
      setSelectedPolicies([]);
      setSelectedTerminationPolicyId(null);
      setDetailsOfIncident('');
      setSupervisorCommitment('');
      setSupervisorComments('');
      setPositiveResults('');
      setNegativeConsequences('');
    }
  }, [isOpen, fetchSettings]);

  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.showModal();
    } else {
      dialogRef.current?.close();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  const togglePolicy = (sectionId: string, policy: { id: string; title: string; description: string; points: number }) => {
    setSelectedPolicies((prev) => {
      const exists = prev.find((p) => p.policyId === policy.id && p.sectionId === sectionId);
      if (exists) return prev.filter((p) => !(p.policyId === policy.id && p.sectionId === sectionId));
      return [...prev, { policyId: policy.id, sectionId, title: policy.title, description: policy.description, points: policy.points }];
    });
  };

  const handleSubmit = async () => {
    if (!detailsOfIncident.trim()) { toast.error('Details of incident is required'); return; }
    if (!supervisorCommitment.trim()) { toast.error('Supervisor commitment is required'); return; }
    if (!supervisorComments.trim()) { toast.error('Supervisor comments is required'); return; }
    if (selectedPolicies.length === 0 && !isImmediateTermination) {
      toast.error('Please select at least one policy');
      return;
    }

    setSubmitting(true);
    try {
      const terminationPolicy = isImmediateTermination && settings
        ? settings.immediateTerminationPolicies.find((p) => p.id === selectedTerminationPolicyId)
        : undefined;

      const payload: IncidentCreatePayload = {
        employeeId,
        locationId,
        appliedPolicies: selectedPolicies,
        isImmediateTermination,
        immediateTerminationPolicy: terminationPolicy ?? undefined,
        detailsOfIncident: detailsOfIncident.trim(),
        supervisorCommitment: supervisorCommitment.trim(),
        supervisorComments: supervisorComments.trim(),
        positiveResults: positiveResults.trim() || undefined,
        negativeConsequences: negativeConsequences.trim() || undefined,
      };

      await disciplinaryManagementService.createIncident(payload);
      toast.success('Incident created successfully');
      onSuccess();
      onClose();
    } catch {
      toast.error('Failed to create incident');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <dialog
      ref={dialogRef}
      className="modal-full-viewport z-[300] m-0 grid place-items-center bg-transparent border-0 p-4 outline-none [&::backdrop]:bg-black/50 [&::backdrop]:cursor-pointer"
      aria-labelledby="assign-points-modal-title"
      onClose={onClose}
    >
      <div className="bg-card-background rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 id="assign-points-modal-title" className="text-base font-semibold text-primary">
              Assign Disciplinary Points
            </h2>
            <p className="text-xs text-tertiary mt-0.5">
              Employee: <span className="font-medium text-secondary">{employeeName}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-tertiary hover:text-primary transition-colors cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Steps indicator */}
        <div className="flex items-center gap-2 px-6 py-3 bg-gray-50 text-xs">
          <span className={`px-2.5 py-1 rounded-full font-medium ${step === 'policies' ? 'bg-button-primary text-white' : 'bg-gray-200 text-secondary'}`}>
            1. Select Policies
          </span>
          <span className="text-gray-300">→</span>
          <span className={`px-2.5 py-1 rounded-full font-medium ${step === 'report' ? 'bg-button-primary text-white' : 'bg-gray-200 text-secondary'}`}>
            2. Incident Report
          </span>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {loadingSettings ? (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <Spinner size="lg" className="text-button-primary" />
              <span className="text-sm text-tertiary">Loading policies...</span>
            </div>
          ) : step === 'policies' ? (
            <div className="space-y-6">
              {settings?.policySections.map((section) => (
                <div key={section.id}>
                  <h3 className="text-sm font-semibold text-primary mb-2">{section.name}</h3>
                  <div className="space-y-2">
                    {section.policies.map((policy) => {
                      const isSelected = selectedPolicies.some(
                        (p) => p.policyId === policy.id && p.sectionId === section.id,
                      );
                      return (
                        <label
                          key={policy.id}
                          className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${isSelected ? 'border-button-primary bg-button-primary/5' : 'border-gray-200 hover:bg-gray-50'}`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => togglePolicy(section.id, policy)}
                            className="mt-0.5 accent-button-primary"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-medium text-primary">{policy.title}</span>
                              <span className="text-xs font-semibold text-button-primary whitespace-nowrap">
                                {policy.points} pts
                              </span>
                            </div>
                            <p className="text-xs text-tertiary mt-0.5">{policy.description}</p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}

              {(settings?.immediateTerminationPolicies.length ?? 0) > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-red-600 mb-2">
                    Immediate Termination Policies
                  </h3>
                  <div className="space-y-2">
                    {settings!.immediateTerminationPolicies.map((policy) => {
                      const isSelected = selectedTerminationPolicyId === policy.id;
                      return (
                        <label
                          key={policy.id}
                          className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${isSelected ? 'border-red-400 bg-red-50' : 'border-gray-200 hover:bg-gray-50'}`}
                        >
                          <input
                            type="radio"
                            name="terminationPolicy"
                            checked={isSelected}
                            onChange={() => setSelectedTerminationPolicyId(isSelected ? null : policy.id)}
                            className="mt-0.5 accent-red-600"
                          />
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium text-primary">{policy.title}</span>
                            <p className="text-xs text-tertiary mt-0.5">{policy.description}</p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">
                  Details of Incident *
                </label>
                <textarea
                  ref={detailsRef}
                  value={detailsOfIncident}
                  onChange={(e) => setDetailsOfIncident(e.target.value)}
                  rows={1}
                  className="w-full min-h-[2.75rem] px-3 py-2 border border-gray-300 rounded-lg text-sm text-primary bg-card-background focus:outline-none focus:ring-2 focus:ring-button-primary/30 focus:border-button-primary resize-none overflow-hidden"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">
                  Supervisor Commitment *
                </label>
                <textarea
                  ref={commitmentRef}
                  value={supervisorCommitment}
                  onChange={(e) => setSupervisorCommitment(e.target.value)}
                  rows={1}
                  className="w-full min-h-[2.75rem] px-3 py-2 border border-gray-300 rounded-lg text-sm text-primary bg-card-background focus:outline-none focus:ring-2 focus:ring-button-primary/30 focus:border-button-primary resize-none overflow-hidden"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">
                  Supervisor Comments *
                </label>
                <textarea
                  ref={commentsRef}
                  value={supervisorComments}
                  onChange={(e) => setSupervisorComments(e.target.value)}
                  rows={1}
                  className="w-full min-h-[2.75rem] px-3 py-2 border border-gray-300 rounded-lg text-sm text-primary bg-card-background focus:outline-none focus:ring-2 focus:ring-button-primary/30 focus:border-button-primary resize-none overflow-hidden"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">
                  Positive Results <span className="text-tertiary">(optional)</span>
                </label>
                <textarea
                  ref={positiveRef}
                  value={positiveResults}
                  onChange={(e) => setPositiveResults(e.target.value)}
                  rows={1}
                  className="w-full min-h-[2.75rem] px-3 py-2 border border-gray-300 rounded-lg text-sm text-primary bg-card-background focus:outline-none focus:ring-2 focus:ring-button-primary/30 focus:border-button-primary resize-none overflow-hidden"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">
                  Negative Consequences <span className="text-tertiary">(optional)</span>
                </label>
                <textarea
                  ref={negativeRef}
                  value={negativeConsequences}
                  onChange={(e) => setNegativeConsequences(e.target.value)}
                  rows={1}
                  className="w-full min-h-[2.75rem] px-3 py-2 border border-gray-300 rounded-lg text-sm text-primary bg-card-background focus:outline-none focus:ring-2 focus:ring-button-primary/30 focus:border-button-primary resize-none overflow-hidden"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50">
          <div className="text-sm font-medium text-primary">
            Total Points: <span className="text-button-primary">{totalPoints}</span>
            {isImmediateTermination && (
              <span className="ml-2 text-red-600 font-semibold">+ Immediate Termination</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {step === 'report' && (
              <button
                type="button"
                onClick={() => setStep('policies')}
                className="px-4 py-2 text-xs font-medium text-secondary border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
              >
                Back
              </button>
            )}
            {step === 'policies' ? (
              <button
                type="button"
                onClick={() => setStep('report')}
                disabled={selectedPolicies.length === 0 && !isImmediateTermination}
                className="px-4 py-2 text-xs font-medium text-white bg-button-primary rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
              >
                Next: Report Details
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="px-4 py-2 text-xs font-medium text-white bg-button-primary rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
              >
                {submitting ? 'Creating...' : 'Create Incident'}
              </button>
            )}
          </div>
        </div>
      </div>
    </dialog>,
    document.body,
  );
};
