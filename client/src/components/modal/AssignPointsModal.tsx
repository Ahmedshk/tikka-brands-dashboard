import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useLayoutEffect,
  type ReactNode,
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

type Step = 'businessLegalName' | 'policies' | 'report';

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
  const [step, setStep] = useState<Step>('businessLegalName');
  const [settings, setSettings] = useState<DisciplinarySettings | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [businessLegalName, setBusinessLegalName] = useState('');

  const [selectedPolicies, setSelectedPolicies] = useState<SelectedPolicy[]>([]);
  const [selectedTerminationPolicyIds, setSelectedTerminationPolicyIds] = useState<string[]>([]);

  const [detailsOfIncident, setDetailsOfIncident] = useState('');
  const [supervisorCommitment, setSupervisorCommitment] = useState('');
  const [associateCommitment, setAssociateCommitment] = useState('');
  const [supervisorComments, setSupervisorComments] = useState('');
  const [associateComments, setAssociateComments] = useState('');
  const [positiveResults, setPositiveResults] = useState('');
  const [negativeConsequences, setNegativeConsequences] = useState('');

  const totalPoints = selectedPolicies.reduce((sum, p) => sum + p.points, 0);
  const isImmediateTermination = selectedTerminationPolicyIds.length > 0;
  const isBusinessLegalNameStep = step === 'businessLegalName';
  const isPoliciesStep = step === 'policies';

  const detailsRef = useAutoResizeTextareaRef(detailsOfIncident);
  const commitmentRef = useAutoResizeTextareaRef(supervisorCommitment);
  const associateCommitmentRef = useAutoResizeTextareaRef(associateCommitment);
  const commentsRef = useAutoResizeTextareaRef(supervisorComments);
  const associateCommentsRef = useAutoResizeTextareaRef(associateComments);
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
      setStep('businessLegalName');
      setBusinessLegalName('');
      setSelectedPolicies([]);
      setSelectedTerminationPolicyIds([]);
      setDetailsOfIncident('');
      setSupervisorCommitment('');
      setAssociateCommitment('');
      setSupervisorComments('');
      setAssociateComments('');
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

  const toggleTerminationPolicy = (policyId: string) => {
    setSelectedTerminationPolicyIds((prev) => (
      prev.includes(policyId)
        ? prev.filter((id) => id !== policyId)
        : [...prev, policyId]
    ));
  };

  const handleSubmit = async () => {
    if (!businessLegalName.trim()) { toast.error('Business legal name is required'); return; }
    if (!detailsOfIncident.trim()) { toast.error('Details of incident is required'); return; }
    if (!supervisorCommitment.trim()) { toast.error('Supervisor commitment is required'); return; }
    if (!supervisorComments.trim()) { toast.error('Supervisor comments is required'); return; }
    if (selectedPolicies.length === 0 && !isImmediateTermination) {
      toast.error('Please select at least one policy');
      return;
    }

    setSubmitting(true);
    try {
      const terminationPolicies = isImmediateTermination && settings
        ? settings.immediateTerminationPolicies.filter((p) => selectedTerminationPolicyIds.includes(p.id))
        : [];

      const payload: IncidentCreatePayload = {
        employeeId,
        locationId,
        businessLegalName: businessLegalName.trim(),
        appliedPolicies: selectedPolicies,
        isImmediateTermination,
        immediateTerminationPolicies: terminationPolicies.length > 0 ? terminationPolicies : undefined,
        detailsOfIncident: detailsOfIncident.trim(),
        supervisorCommitment: supervisorCommitment.trim(),
        supervisorComments: supervisorComments.trim(),
        associateCommitment: associateCommitment.trim() || undefined,
        associateComments: associateComments.trim() || undefined,
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

  let bodyContent: ReactNode;
  if (isBusinessLegalNameStep) {
    bodyContent = (
      <div>
        <label htmlFor="business-legal-name" className="block text-xs font-medium text-secondary mb-1">
          Business Legal Name *
        </label>
        <p className="text-xs text-tertiary mb-2">
          This name appears on the generated Performance Improvement Plan (PIP) document.
        </p>
        <input
          id="business-legal-name"
          type="text"
          value={businessLegalName}
          onChange={(e) => setBusinessLegalName(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-primary bg-card-background focus:outline-none focus:ring-2 focus:ring-button-primary/30 focus:border-button-primary"
          placeholder="e.g. Tikka Brands LLC"
        />
      </div>
    );
  } else if (loadingSettings) {
    bodyContent = (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <Spinner size="lg" className="text-button-primary" />
        <span className="text-sm text-tertiary">Loading policies...</span>
      </div>
    );
  } else if (isPoliciesStep) {
    bodyContent = (
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
                      aria-label={`Select policy ${policy.title}`}
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
                const isSelected = selectedTerminationPolicyIds.includes(policy.id);
                return (
                  <label
                    key={policy.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${isSelected ? 'border-red-400 bg-red-50' : 'border-gray-200 hover:bg-gray-50'}`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleTerminationPolicy(policy.id)}
                      aria-label={`Select immediate termination policy ${policy.title}`}
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
    );
  } else {
    bodyContent = (
      <div className="space-y-4">
        <div>
          <label htmlFor="details-of-incident" className="block text-xs font-medium text-secondary mb-1">
            Details of Incident *
          </label>
          <textarea
            id="details-of-incident"
            ref={detailsRef}
            value={detailsOfIncident}
            onChange={(e) => setDetailsOfIncident(e.target.value)}
            rows={1}
            className="w-full min-h-[2.75rem] px-3 py-2 border border-gray-300 rounded-lg text-sm text-primary bg-card-background focus:outline-none focus:ring-2 focus:ring-button-primary/30 focus:border-button-primary resize-none overflow-hidden"
          />
        </div>
        <div>
          <label htmlFor="supervisor-commitment" className="block text-xs font-medium text-secondary mb-1">
            Supervisor Commitment *
          </label>
          <textarea
            id="supervisor-commitment"
            ref={commitmentRef}
            value={supervisorCommitment}
            onChange={(e) => setSupervisorCommitment(e.target.value)}
            rows={1}
            className="w-full min-h-[2.75rem] px-3 py-2 border border-gray-300 rounded-lg text-sm text-primary bg-card-background focus:outline-none focus:ring-2 focus:ring-button-primary/30 focus:border-button-primary resize-none overflow-hidden"
          />
        </div>
        <div>
          <label htmlFor="associate-commitment" className="block text-xs font-medium text-secondary mb-1">
            Associate Commitment <span className="text-tertiary">(optional)</span>
          </label>
          <textarea
            id="associate-commitment"
            ref={associateCommitmentRef}
            value={associateCommitment}
            onChange={(e) => setAssociateCommitment(e.target.value)}
            rows={1}
            className="w-full min-h-[2.75rem] px-3 py-2 border border-gray-300 rounded-lg text-sm text-primary bg-card-background focus:outline-none focus:ring-2 focus:ring-button-primary/30 focus:border-button-primary resize-none overflow-hidden"
          />
        </div>
        <div>
          <label htmlFor="supervisor-comments" className="block text-xs font-medium text-secondary mb-1">
            Supervisor Comments *
          </label>
          <textarea
            id="supervisor-comments"
            ref={commentsRef}
            value={supervisorComments}
            onChange={(e) => setSupervisorComments(e.target.value)}
            rows={1}
            className="w-full min-h-[2.75rem] px-3 py-2 border border-gray-300 rounded-lg text-sm text-primary bg-card-background focus:outline-none focus:ring-2 focus:ring-button-primary/30 focus:border-button-primary resize-none overflow-hidden"
          />
        </div>
        <div>
          <label htmlFor="associate-comments" className="block text-xs font-medium text-secondary mb-1">
            Associate Comments <span className="text-tertiary">(optional)</span>
          </label>
          <textarea
            id="associate-comments"
            ref={associateCommentsRef}
            value={associateComments}
            onChange={(e) => setAssociateComments(e.target.value)}
            rows={1}
            className="w-full min-h-[2.75rem] px-3 py-2 border border-gray-300 rounded-lg text-sm text-primary bg-card-background focus:outline-none focus:ring-2 focus:ring-button-primary/30 focus:border-button-primary resize-none overflow-hidden"
          />
        </div>
        <div>
          <label htmlFor="positive-results" className="block text-xs font-medium text-secondary mb-1">
            Positive Results <span className="text-tertiary">(optional)</span>
          </label>
          <textarea
            id="positive-results"
            ref={positiveRef}
            value={positiveResults}
            onChange={(e) => setPositiveResults(e.target.value)}
            rows={1}
            className="w-full min-h-[2.75rem] px-3 py-2 border border-gray-300 rounded-lg text-sm text-primary bg-card-background focus:outline-none focus:ring-2 focus:ring-button-primary/30 focus:border-button-primary resize-none overflow-hidden"
          />
        </div>
        <div>
          <label htmlFor="negative-consequences" className="block text-xs font-medium text-secondary mb-1">
            Negative Consequences <span className="text-tertiary">(optional)</span>
          </label>
          <textarea
            id="negative-consequences"
            ref={negativeRef}
            value={negativeConsequences}
            onChange={(e) => setNegativeConsequences(e.target.value)}
            rows={1}
            className="w-full min-h-[2.75rem] px-3 py-2 border border-gray-300 rounded-lg text-sm text-primary bg-card-background focus:outline-none focus:ring-2 focus:ring-button-primary/30 focus:border-button-primary resize-none overflow-hidden"
          />
        </div>
      </div>
    );
  }

  if (!isOpen) return null;

  return createPortal(
    <dialog
      ref={dialogRef}
      className="modal-full-viewport z-[300] m-0 grid place-items-center bg-transparent border-0 p-4 outline-none [&::backdrop]:bg-black/50 [&::backdrop]:cursor-pointer"
      aria-labelledby="assign-points-modal-title"
      onClose={onClose}
    >
      <div className="relative w-full min-w-0 max-w-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute -top-2 -right-2 md:-top-4 md:-right-4 z-[400] flex h-5 w-5 md:h-8 md:w-8 shrink-0 items-center justify-center rounded-full bg-white text-gray-700 shadow-md ring-1 ring-gray-200 hover:bg-gray-100 hover:ring-gray-300 focus:outline-none focus:ring-2 focus:ring-primary"
          aria-label="Close"
          title="Close"
        >
          <span className="text-lg md:text-xl 2xl:text-2xl leading-none">×</span>
        </button>
      <div className="bg-card-background rounded-xl shadow-2xl w-full max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-primary">
          <div>
            <h2 id="assign-points-modal-title" className="text-base font-semibold text-white">
              Assign Disciplinary Points
            </h2>
            <p className="text-xs text-white/90 mt-0.5">
              Employee: <span className="font-medium text-white">{employeeName}</span>
            </p>
          </div>
        </div>

        {/* Steps indicator */}
        <div className="flex items-center gap-2 px-6 py-3 bg-gray-50 text-xs flex-wrap">
          <span className={`px-2.5 py-1 rounded-full font-medium ${step === 'businessLegalName' ? 'bg-button-primary text-white' : 'bg-gray-200 text-secondary'}`}>
            1. Business Legal Name
          </span>
          <span className="text-gray-300">→</span>
          <span className={`px-2.5 py-1 rounded-full font-medium ${step === 'policies' ? 'bg-button-primary text-white' : 'bg-gray-200 text-secondary'}`}>
            2. Select Policies
          </span>
          <span className="text-gray-300">→</span>
          <span className={`px-2.5 py-1 rounded-full font-medium ${step === 'report' ? 'bg-button-primary text-white' : 'bg-gray-200 text-secondary'}`}>
            3. Incident Report
          </span>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">{bodyContent}</div>

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
            {step === 'policies' && (
              <button
                type="button"
                onClick={() => setStep('businessLegalName')}
                className="px-4 py-2 text-xs font-medium text-secondary border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
              >
                Back
              </button>
            )}
            {step === 'businessLegalName' ? (
              <button
                type="button"
                onClick={() => setStep('policies')}
                disabled={!businessLegalName.trim()}
                className="px-4 py-2 text-xs font-medium text-white bg-button-primary rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
              >
                Next: Select Policies
              </button>
            ) : step === 'policies' ? (
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
      </div>
    </dialog>,
    document.body,
  );
};
