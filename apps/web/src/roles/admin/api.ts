// Administrator data hooks. Shapes come only from the shared contract.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  TAccountPasswordResponse, TAdminAccountDto, TAdminAccountsResponse, TAdminFleetResponse, TAdminSystemResponse,
  TCreateAccountRequest, TDriverDto, TRebuildDayResponse, TSupportRequestDto,
} from '@waypoint/shared/contract';
import { api } from '../../api';

const send = (method: string, body: unknown = {}): RequestInit => ({ method, body: JSON.stringify(body) });

export const useSystem = () => useQuery({ queryKey: ['admin', 'system'], queryFn: () => api<TAdminSystemResponse>('/admin/system'), refetchInterval: 30_000 });
export const useAccounts = () => useQuery({ queryKey: ['admin', 'accounts'], queryFn: () => api<TAdminAccountsResponse>('/admin/accounts') });
export const useFleet = () => useQuery({ queryKey: ['admin', 'fleet'], queryFn: () => api<TAdminFleetResponse>('/admin/fleet') });
export const useSupportRequests = () => useQuery({ queryKey: ['admin', 'support-requests'], queryFn: () => api<{ requests: TSupportRequestDto[] }>('/admin/support-requests'), refetchInterval: 10_000 });

/** Any admin change refreshes every admin screen (they share accounts, drivers and counts). */
function useWrite<A, R>(fn: (a: A) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSettled: () => qc.invalidateQueries({ queryKey: ['admin'] }) });
}

export const useCreateAccount = () => useWrite((a: TCreateAccountRequest) => api<TAccountPasswordResponse>('/admin/accounts', send('POST', a)));
export const useSetActive = () => useWrite((a: { id: string; active: boolean }) => api<TAdminAccountDto>(`/admin/accounts/${a.id}`, send('PATCH', { active: a.active })));
export const useResetPassword = () => useWrite((id: string) => api<TAccountPasswordResponse>(`/admin/accounts/${id}/reset-password`, send('POST')));
export const useCreateDriver = () => useWrite((a: { name: string; phone?: string; licenseNo?: string }) => api<TDriverDto>('/admin/drivers', send('POST', a)));
export const useAssignDriver = () =>
  useWrite((a: { vehicleId: string; driverId: string | null; move?: boolean }) => api<{ ok: boolean }>(`/admin/vehicles/${a.vehicleId}/driver`, send('PUT', { driverId: a.driverId, move: a.move })));
export const useRebuildToday = () => useWrite(() => api<TRebuildDayResponse>('/admin/system/rebuild-today', send('POST')));
export const useResolveSupportRequest = () => useWrite((id: string) => api<{ ok: boolean }>(`/admin/support-requests/${id}/resolve`, send('POST')));
