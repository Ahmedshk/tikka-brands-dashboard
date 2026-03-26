import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { Layout } from '../../components/common/Layout';
import { Spinner } from '../../components/common/Spinner';
import { AssignPointsModal } from '../../components/modal/AssignPointsModal';
import { EmbeddedAdobeSignModal } from '../../components/modal/EmbeddedAdobeSignModal';
import { IncidentDetailsModal } from '../../components/modal/IncidentDetailsModal';
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
import type { NotificationItem } from '../../services/notification.service';
import { getSocket } from '../../services/socket.service';
import type { IncidentHistoryItem } from '../../types/disciplinaryManagement.types';

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
      supervisorComments: inc.supervisorComments,
      positiveResults: inc.positiveResults,
      negativeConsequences: inc.negativeConsequences,
      managerSignedAt: inc.managerSignedAt,
      employeeSignedAt: inc.employeeSignedAt,
      signedDocumentPublicId: inc.signedDocumentPublicId,
      auditTrailPublicId: inc.auditTrailPublicId,
    };
  });
}

export const DisciplinaryManagementDetails = () => {
  const { employeeId } = useParams<{ employeeId: string }>();
  const navigate = useNavigate();
  const user = useSelector((state: RootState) => state.auth.user);
  const currentLocation = useSelector((state: RootState) => state.location.currentLocation);
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

  const refreshDetailsSilently = useCallback(async () => {
    if (!employeeId) return;
    try {
      const data = await disciplinaryManagementService.getEmployeeDetails(employeeId);
      setDetails(data);
    } catch {
      // Ignore transient realtime refresh errors.
    }
  }, [employeeId]);

  useEffect(() => {
    if (employeeId == null || notifications.length === 0) return;
    const latest: NotificationItem | undefined = notifications[0];
    if (!latest || latest._id === lastHandledNotificationIdRef.current) return;
    lastHandledNotificationIdRef.current = latest._id;

    const data = latest.data ?? {};
    const notificationEmployeeId = typeof data.employeeId === 'string' ? data.employeeId : null;
    if (notificationEmployeeId !== employeeId) return;

    const realtimeTypes = new Set([
      'disciplinary_manager_signed',
      'disciplinary_document_signed',
      'disciplinary_signing_aborted',
    ]);
    if (!realtimeTypes.has(latest.type)) return;

    void refreshDetailsSilently();
  }, [employeeId, notifications, refreshDetailsSilently]);

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
    if (!employeeId) return;
    if (signingLoadingIncidentId) return;
    if (incident.signingPhase !== 'pending_manager') {
      toast.error('This incident is not waiting for manager signature.');
      return;
    }
    setSigningLoadingIncidentId(incident.id);
    setSignIframeLoading(true);
    try {
      const { embeddedSignUrl } =
        await disciplinaryManagementService.getEmbeddedSignUrl(incident.id);
      setEmbedUrl(embeddedSignUrl);
      setSignModalOpen(true);
    } catch {
      toast.error(
        'Could not start signing. Ensure Adobe Sign is configured, emails exist, and there is an incident awaiting your signature.',
      );
    } finally {
      setSigningLoadingIncidentId(null);
    }
  };

  const handleDownloadIncident = (incident: IncidentHistoryItem) => {
    if (!incident.signedDocumentPublicId) {
      toast.error('Document is not available for download yet.');
      return;
    }
    const filename = `${incident.documentName}`;
    const qs = new URLSearchParams({
      publicId: incident.signedDocumentPublicId,
      resourceType: 'raw',
      filename,
    });
    window.open(`/api/proxy/document?${qs.toString()}`, '_blank', 'noopener,noreferrer');
  };

  const handleDownloadIncidentAuditTrail = (incident: IncidentHistoryItem) => {
    if (!incident.auditTrailPublicId) {
      toast.error('Audit trail is not available yet.');
      return;
    }
    const filename = `AuditTrail_${incident.documentName}`;
    const qs = new URLSearchParams({
      publicId: incident.auditTrailPublicId,
      resourceType: 'raw',
      filename,
    });
    window.open(`/api/proxy/document?${qs.toString()}`, '_blank', 'noopener,noreferrer');
  };

  const handleViewIncident = (incident: IncidentHistoryItem) => {
    setSelectedIncident(incident);
    setIncidentDetailsOpen(true);
  };

  if (!employeeId) {
    return (
      <Layout>
        <div className="p-6">
          <p className="text-primary mb-4">Employee not found.</p>
          <button
            type="button"
            onClick={() => navigate('/dashboard/disciplinary-management')}
            className="text-quaternary hover:underline font-medium"
          >
            ← Back to Disciplinary Management
          </button>
        </div>
      </Layout>
    );
  }

  if (!loading && !details) {
    return (
      <Layout>
        <div className="p-6">
          <p className="text-primary mb-4">Employee not found.</p>
          <button
            type="button"
            onClick={() => navigate('/dashboard/disciplinary-management')}
            className="text-quaternary hover:underline font-medium"
          >
            ← Back to Disciplinary Management
          </button>
        </div>
      </Layout>
    );
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
  const recentIncidentsPreview = recentIncidents.slice(0, 5);
  const priorIncidentsPreview = priorIncidents.slice(0, 5);
  const currentUserId = user?._id ?? null;

  return (
    <Layout>
      <div className="p-6">
        <DetailsPageHeader
          dateWindowStart={windowRange.start}
          dateWindowEnd={windowRange.end}
          onBack={() => navigate('/dashboard/disciplinary-management')}
          onAssignPoints={() => setAssignPointsOpen(true)}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
          <div className="lg:col-span-1 min-h-0">
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
          <div className="lg:col-span-2 min-h-0">
            {isCardLoading ? (
              <CardLoader message="Loading incident history..." />
            ) : (
              <IncidentHistoryCard
                items={recentIncidentsPreview}
                emptyMessage={`No incidents found in the last ${rollingDays} days.`}
                canSign={(item) =>
                  item.signingPhase === 'pending_manager' &&
                  currentUserId != null &&
                  item.assignerId === currentUserId
                }
                signLoadingIncidentId={signingLoadingIncidentId}
                onSign={(item) => {
                  void handleSignIncident(item);
                }}
                onView={handleViewIncident}
                onViewAll={() => setIncidentModalOpen(true)}
              />
            )}
          </div>
          <div className="lg:col-span-1 min-h-0">
            {isCardLoading ? (
              <CardLoader message="Loading required protocol..." />
            ) : (
              <RequiredProtocolCard
                message={protocol!.message}
                currentAction={protocol!.currentAction}
              />
            )}
          </div>
          <div className="lg:col-span-2 min-h-0">
            {isCardLoading ? (
              <CardLoader message="Loading prior incidents..." />
            ) : (
              <IncidentHistoryCard
                title={`Incidents Prior To ${rollingDays} Days`}
                items={priorIncidentsPreview}
                emptyMessage={`No incidents found prior to ${rollingDays} days.`}
                canSign={() => false}
                onView={handleViewIncident}
                onViewAll={() => setPriorIncidentModalOpen(true)}
              />
            )}
          </div>
        </div>
      </div>

      <IncidentHistoryModal
        isOpen={incidentModalOpen}
        onClose={() => setIncidentModalOpen(false)}
        title={`Incident History (${rollingDays} Days)`}
        items={recentIncidents}
        canSign={(item) =>
          item.signingPhase === 'pending_manager' &&
          currentUserId != null &&
          item.assignerId === currentUserId
        }
        signLoadingIncidentId={signingLoadingIncidentId}
        onSign={(item) => {
          void handleSignIncident(item);
        }}
        onView={handleViewIncident}
      />
      <IncidentHistoryModal
        isOpen={priorIncidentModalOpen}
        onClose={() => setPriorIncidentModalOpen(false)}
        title={`Incidents Prior To ${rollingDays} Days`}
        items={priorIncidents}
        canSign={() => false}
        onView={handleViewIncident}
      />

      <IncidentDetailsModal
        isOpen={incidentDetailsOpen}
        incident={selectedIncident}
        onClose={() => {
          setIncidentDetailsOpen(false);
          setSelectedIncident(null);
        }}
        onDownload={handleDownloadIncident}
        onDownloadAuditTrail={handleDownloadIncidentAuditTrail}
      />

      {employeeId && details && (
        <AssignPointsModal
          isOpen={assignPointsOpen}
          onClose={() => setAssignPointsOpen(false)}
          employeeId={employeeId}
          employeeName={employee.name}
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
