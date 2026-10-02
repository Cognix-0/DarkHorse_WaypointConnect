// Loader data hooks. Shapes come only from the shared contract.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TLoaderTripDetail, TLoaderVehiclesResponse, TPlanChangesResponse, TReportProblemRequest } from '@waypoint/shared/contract';
import { api } from '../../api';

const post = (body: unknown = {}): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

export const useVehicles = () => useQuery({ queryKey: ['loader', 'vehicles'], queryFn: () => api<TLoaderVehiclesResponse>('/loader/vehicles'), refetchInterval: 30_000 });
export const useTrip = (id: string) => useQuery({ queryKey: ['loader', 'trip', id], queryFn: () => api<TLoaderTripDetail>(`/loader/trips/${id}`) });
export const useChanges = () => useQuery({ queryKey: ['loader', 'changes'], queryFn: () => api<TPlanChangesResponse>('/loader/changes') });

function useWrite<A = void, R = unknown>(fn: (a: A) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSettled: () => qc.invalidateQueries({ queryKey: ['loader'] }) });
}
export const useClaim = () => useWrite((a: { tripId: string; takeOver?: boolean }) => api<{ ok: boolean }>(`/loader/trips/${a.tripId}/claim`, post({ takeOver: a.takeOver })));
export const useTick = () => useWrite((a: { lineId: string; loaded: boolean }) => api<{ ok: boolean }>(`/loader/lines/${a.lineId}/tick`, post({ loaded: a.loaded })));
export const useReport = () => useWrite((a: { tripId: string } & TReportProblemRequest) => {
  const { tripId, ...body } = a;
  return api<{ ok: boolean }>(`/loader/trips/${tripId}/problems`, post(body));
});
export const useSeal = () => useWrite((a: { tripId: string; sealNo: string; reeferTempC: number | null; carryOverNote?: string }) => {
  const { tripId, ...body } = a;
  return api<{ ok: boolean; carried: string[] }>(`/loader/trips/${tripId}/seal`, post(body));
});
export const useMarkMoved = () => useWrite((orderId: string) => api<{ ok: boolean }>(`/loader/changes/${orderId}/moved`, post()));
export const useAck = () => useWrite(() => api<{ ok: boolean }>('/loader/changes/ack', post()));
