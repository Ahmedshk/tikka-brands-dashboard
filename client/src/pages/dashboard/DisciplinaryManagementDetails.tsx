import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { Layout } from '../../components/common/Layout';
import { Spinner } from '../../components/common/Spinner';
import { AssignPointsModal } from '../../components/modal/AssignPointsModal';
import { EmbeddedAdobeSignModal } from '../../components/modal/EmbeddedAdobeSignModal';
import { IncidentDetailsModal } from '../../components/modal/IncidentDetailsModal';
import { selectCurrentLocation } from '../../store/locationSelectors';
import type { RootState } from '../../store/store';
import {
  DetailsPageHeader,
  EmployeeWithRollingTotalCard,
  RequiredProtocolCard,
  IncidentHistoryCard,
} from '../../components/DisciplinaryManagement';
import { IncidentHistoryModal } from '../../components/modal/IncidentHistoryModal';
import {
  disciplinaryManagementService,
  type EmployeeDetails,
} from '../../services/disciplinaryManagement.service';
import { getSocket } from '../../services/socket.service';
import type { IncidentHistoryItem } from '../../types/disciplinaryManagement.types';
import { useCanAccessComponent } from '../../hooks/useCanAccessComponent';
import {
  downloadIncidentAuditTrail,
  downloadSignedIncidentDocument,
  startIncidentSigning,
} from '../../utils/disciplinaryManagementDetailsHelpers';
import { useDisciplinaryRealtimeNotificationRefresh } from '../../utils/disciplinaryManagementDetailsHooks';
import { canManagerSignIncident } from '../../utils/disciplinaryManagementDetailsPredicates';

const PAGE_ID = 'disciplinary-management-details';

function formatDateRange(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getDateWindow(rollingDays: number): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - rollingDays);
  return { start: formatDateRange(start), end: formatDateRange(end) };
}

function CardLoader({ message }: Readonly<{ message: string }>) {
  return (
    <div className="bg-card-background rounded-xl shadow border border-gray-200 overflow-hidden h-full min-h-[280px] flex items-center justify-center">
      <div className="flex flex-col items-center justify-center gap-3 text-primary">
        <Spinner size="xl" className="text-button-primary" />
        <span className="text-sm">{message}</span>
      </div>
    </div>
  );
}

function mapIncidentSigningStatus(
  api: string,
): IncidentHistoryItem['status'] {
  switch (api) {
    case 'completed':
      return 'signed';
    case 'declined':
      return 'declined';
    case 'cancelled':
      return 'cancelled';
    case 'expired':
      return 'expired';
    default:
      return 'pending';
  }
}

function mapIncidents(details: EmployeeDetails): IncidentHistoryItem[] {
  const employeeToken = details.employee.name
    .trim()
    .replaceAll(/[^a-zA-Z0-9]+/g, '_')
    .replaceAll(/(^_+)|(_+$)/g, '') || 'Employee';
  return details.incidents.map((inc) => {
    const policyNames = inc.appliedPolicies.map((p) => p.title).join(', ');
    const label = inc.isImmediateTermination ? 'Immediate Termination' : policyNames || 'Incident';
    const assignerName = inc.reportedBy
      ? `${inc.reportedBy.firstName ?? ''} ${inc.reportedBy.lastName ?? ''}`.trim()
      : '—';
    const dateToken = new Date(inc.incidentDate).toISOString().slice(0, 10);
    return {
      id: inc._id,
      incidentType: label,
      date: new Date(inc.incidentDate).toLocaleDateString('en-US'),
      incidentDateIso: inc.incidentDate,
      documentName: `PIP_${employeeToken}_${dateToken}.pdf`,
      status: mapIncidentSigningStatus(inc.signingStatus),
      signingPhase: inc.signingStatus as IncidentHistoryItem['signingPhase'],
      assignerId: inc.reportedBy?._id,
      assignerName,
      totalPoints: inc.totalPoints,
      detailsOfIncident: inc.detailsOfIncident,
      supervisorCommitment: inc.supervisorCommitment,
      associateCommitment: inc.associateCommitment,
      supervisorComments: inc.supervisorComments,
      associateComments: inc.associateComments,
      positiveResults: inc.positiveResults,
      negativeConsequences: inc.negativeConsequences,
      managerSignedAt: inc.managerSignedAt,
      employeeSignedAt: inc.employeeSignedAt,
      signedDocumentPublicId: inc.signedDocumentPublicId,
      auditTrailPublicId: inc.auditTrailPublicId,
    };
  });
}

function EmployeeNotFoundState({ onBack }: Readonly<{ onBack: () => void }>) {
  return (
    <Layout>
      <div className="p-6">
        <p className="text-primary mb-4">Employee not found.</p>
        <button type="button" onClick={onBack} className="text-quaternary hover:underline font-medium">
          ← Back to Disciplinary Management
        </button>
      </div>
    </Layout>
  );
}

function DetailsCardsGrid({
  canEmployeeCard,
  canIncidentHistory90,
  canRequiredProtocol,
  canPriorIncidents,
  isCardLoading,
  employee,
  protocol,
  rollingDays,
  recentIncidentsPreview,
  priorIncidentsPreview,
  currentUserId,
  signingLoadingIncidentId,
  onSignIncident,
  onViewIncident,
  onViewAllRecent,
  onViewAllPrior,
}: Readonly<{
  canEmployeeCard: boolean;
  canIncidentHistory90: boolean;
  canRequiredProtocol: boolean;
  canPriorIncidents: boolean;
  isCardLoading: boolean;
  employee: EmployeeDetails["employee"] | undefined;
  protocol: EmployeeDetails["protocol"] | undefined;
  rollingDays: number;
  recentIncidentsPreview: IncidentHistoryItem[];
  priorIncidentsPreview: IncidentHistoryItem[];
  currentUserId: string | null;
  signingLoadingIncidentId: string | null;
  onSignIncident: (item: IncidentHistoryItem) => void;
  onViewIncident: (item: IncidentHistoryItem) => void;
  onViewAllRecent: () => void;
  onViewAllPrior: () => void;
}>) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
      {canEmployeeCard ? (
        <div className="order-1 lg:order-none lg:col-span-1 min-h-0">
          {isCardLoading ? (
            <CardLoader message="Loading employee details..." />
          ) : (
            <EmployeeWithRollingTotalCard
              name={employee!.name}
              role={employee!.role}
              status={employee!.status}
              avatarUrl={employee!.avatarUrl}
              currentPoints={employee!.activePoints}
              maxPoints={employee!.pointsThreshold}
            />
          )}
        </div>
      ) : null}
      {canIncidentHistory90 ? (
        <div className="order-3 lg:order-none lg:col-span-2 min-h-0">
          {isCardLoading ? (
            <CardLoader message="Loading incident history..." />
          ) : (
            <IncidentHistoryCard
              items={recentIncidentsPreview}
              emptyMessage={`No incidents found in the last ${rollingDays} days.`}
              canSign={(item) => canManagerSignIncident(item, currentUserId)}
              signLoadingIncidentId={signingLoadingIncidentId}
              onSign={onSignIncident}
              onView={onViewIncident}
              onViewAll={onViewAllRecent}
            />
          )}
        </div>
      ) : null}
      {canRequiredProtocol ? (
        <div className="order-2 lg:order-none lg:col-span-1 min-h-0">
          {isCardLoading ? (
            <CardLoader message="Loading required protocol..." />
          ) : (
            <RequiredProtocolCard message={protocol!.message} currentAction={protocol!.currentAction} />
          )}
        </div>
      ) : null}
      {canPriorIncidents ? (
        <div className="order-4 lg:order-none lg:col-span-2 min-h-0">
          {isCardLoading ? (
            <CardLoader message="Loading prior incidents..." />
          ) : (
            <IncidentHistoryCard
              title={`Incidents Prior To ${rollingDays} Days`}
              items={priorIncidentsPreview}
              emptyMessage={`No incidents found prior to ${rollingDays} days.`}
              canSign={() => false}
              onView={onViewIncident}
              onViewAll={onViewAllPrior}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}

export const DisciplinaryManagementDetails = () => {
  const { employeeId } = useParams<{ employeeId: string }>();
  const navigate = useNavigate();
  const user = useSelector((state: RootState) => state.auth.user);
  const canAssignPoints = useCanAccessComponent(PAGE_ID, 'assign-points');
  const canEmployeeCard = useCanAccessComponent(PAGE_ID, 'employee-card');
  const canIncidentHistory90 = useCanAccessComponent(PAGE_ID, 'incident-history-90-days');
  const canRequiredProtocol = useCanAccessComponent(PAGE_ID, 'required-protocol');
  const canPriorIncidents = useCanAccessComponent(PAGE_ID, 'prior-incidents');
  const currentLocation = useSelector(selectCurrentLocation);
  const notifications = useSelector((state: RootState) => state.notification.notifications);
  const [incidentModalOpen, setIncidentModalOpen] = useState(false);
  const [priorIncidentModalOpen, setPriorIncidentModalOpen] = useState(false);
  const [incidentDetailsOpen, setIncidentDetailsOpen] = useState(false);
  const [selectedIncident, setSelectedIncident] = useState<IncidentHistoryItem | null>(null);
  const [assignPointsOpen, setAssignPointsOpen] = useState(false);
  const [signModalOpen, setSignModalOpen] = useState(false);
  const [embedUrl, setEmbedUrl] = useState<string | null>(null);
  const [signIframeLoading, setSignIframeLoading] = useState(false);
  const [signingLoadingIncidentId, setSigningLoadingIncidentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState<EmployeeDetails | null>(null);
  const lastHandledNotificationIdRef = useRef<string | null>(null);
  const initialLocationIdRef = useRef<string | null>(null);

  const fetchDetails = useCallback(async () => {
    if (!employeeId) return;
    setLoading(true);
    try {
      const data = await disciplinaryManagementService.getEmployeeDetails(employeeId);
      setDetails(data);
    } catch {
      toast.error('Failed to load employee details');
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  useEffect(() => {
    const locationId = currentLocation?._id ?? null;
    if (initialLocationIdRef.current == null) {
      initialLocationIdRef.current = locationId;
      return;
    }
    if (locationId && initialLocationIdRef.current !== locationId) {
      navigate('/dashboard/disciplinary-management');
    }
  }, [currentLocation?._id, navigate]);

  const refreshDetailsSilently = useCallback(async () => {
    if (!employeeId) return;
    try {
      const data = await disciplinaryManagementService.getEmployeeDetails(employeeId);
      setDetails(data);
    } catch {
      // Ignore transient realtime refresh errors.
    }
  }, [employeeId]);

  useDisciplinaryRealtimeNotificationRefresh({
    employeeId,
    notifications,
    lastHandledNotificationIdRef,
    refreshDetailsSilently,
  });

  useEffect(() => {
    if (!employeeId) return;
    const socket = getSocket();
    if (!socket) return;

    const onIncidentUpdated = (payload: { employeeId?: string }) => {
      if (payload?.employeeId !== employeeId) return;
      void refreshDetailsSilently();
    };

    socket.emit('disciplinary:subscribe-employee', employeeId);
    socket.on('disciplinary:incident-updated', onIncidentUpdated);
    return () => {
      socket.off('disciplinary:incident-updated', onIncidentUpdated);
      socket.emit('disciplinary:unsubscribe-employee', employeeId);
    };
  }, [employeeId, refreshDetailsSilently]);

  const handleSignIncident = async (incident: IncidentHistoryItem) => {
    await startIncidentSigning({
      employeeId,
      signingLoadingIncidentId,
      incident,
      setSigningLoadingIncidentId,
      setSignIframeLoading,
      setEmbedUrl,
      setSignModalOpen,
    });
  };

  const handleDownloadIncident = downloadSignedIncidentDocument;
  const handleDownloadIncidentAuditTrail = downloadIncidentAuditTrail;

  const handleViewIncident = (incident: IncidentHistoryItem) => {
    setSelectedIncident(incident);
    setIncidentDetailsOpen(true);
  };

  const showNotFound = employeeId == null || (loading === false && details == null);
  if (showNotFound) {
    return <EmployeeNotFoundState onBack={() => navigate('/dashboard/disciplinary-management')} />;
  }

  const isCardLoading = loading || details == null;
  const employee = details?.employee;
  const protocol = details?.protocol;
  const rollingDays = details?.settings?.rollingPeriodDays ?? 90;
  const windowRange = getDateWindow(rollingDays);
  const incidents = details ? mapIncidents(details) : [];
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - rollingDays);
  const recentIncidents = incidents.filter((item) => {
    const parsed = new Date(item.incidentDateIso);
    return !Number.isNaN(parsed.getTime()) && parsed >= cutoffDate;
  });
  const priorIncidents = incidents.filter((item) => {
    const parsed = new Date(item.incidentDateIso);
    return !Number.isNaN(parsed.getTime()) && parsed < cutoffDate;
  });
  const recentIncidentsPreview = recentIncidents.slice(0, 3);
  const priorIncidentsPreview = priorIncidents.slice(0, 3);
  const currentUserId = user?._id ?? null;

  return (
    <Layout>
      <div className="p-6">
        <DetailsPageHeader
          dateWindowStart={windowRange.start}
          dateWindowEnd={windowRange.end}
          onBack={() => navigate('/dashboard/disciplinary-management')}
          onAssignPoints={() => setAssignPointsOpen(true)}
          showAssignPoints={canAssignPoints}
        />

        <DetailsCardsGrid
          canEmployeeCard={canEmployeeCard}
          canIncidentHistory90={canIncidentHistory90}
          canRequiredProtocol={canRequiredProtocol}
          canPriorIncidents={canPriorIncidents}
          isCardLoading={isCardLoading}
          employee={employee}
          protocol={protocol}
          rollingDays={rollingDays}
          recentIncidentsPreview={recentIncidentsPreview}
          priorIncidentsPreview={priorIncidentsPreview}
          currentUserId={currentUserId}
          signingLoadingIncidentId={signingLoadingIncidentId}
          onSignIncident={(item) => void handleSignIncident(item)}
          onViewIncident={handleViewIncident}
          onViewAllRecent={() => setIncidentModalOpen(true)}
          onViewAllPrior={() => setPriorIncidentModalOpen(true)}
        />
      </div>

      <IncidentHistoryModal
        isOpen={canIncidentHistory90 && incidentModalOpen}
        onClose={() => setIncidentModalOpen(false)}
        title={`Incident History (${rollingDays} Days)`}
        items={recentIncidents}
        canSign={(item) => canManagerSignIncident(item, currentUserId)}
        signLoadingIncidentId={signingLoadingIncidentId}
        onSign={(item) => {
          void handleSignIncident(item);
        }}
        onView={handleViewIncident}
      />
      <IncidentHistoryModal
        isOpen={canPriorIncidents && priorIncidentModalOpen}
        onClose={() => setPriorIncidentModalOpen(false)}
        title={`Incidents Prior To ${rollingDays} Days`}
        items={priorIncidents}
        canSign={() => false}
        onView={handleViewIncident}
      />

      <IncidentDetailsModal
        isOpen={incidentDetailsOpen && (canIncidentHistory90 || canPriorIncidents)}
        incident={selectedIncident}
        onClose={() => {
          setIncidentDetailsOpen(false);
          setSelectedIncident(null);
        }}
        onDownload={handleDownloadIncident}
        onDownloadAuditTrail={handleDownloadIncidentAuditTrail}
      />

      {employeeId && details && canAssignPoints && (
        <AssignPointsModal
          isOpen={assignPointsOpen}
          onClose={() => setAssignPointsOpen(false)}
          employeeId={employeeId}
          employeeName={employee?.name ?? ''}
          locationId={currentLocation?._id ?? ''}
          onSuccess={fetchDetails}
        />
      )}

      <EmbeddedAdobeSignModal
        isOpen={signModalOpen}
        embedUrl={embedUrl}
        isLoading={signIframeLoading}
        onIframeLoaded={() => setSignIframeLoading(false)}
        onClose={() => {
          setSignModalOpen(false);
          setEmbedUrl(null);
          setSignIframeLoading(false);
        }}
        onSigned={() => {
          toast.success('Your signature was recorded.');
          void fetchDetails();
        }}
      />
    </Layout>
  );
};
