// Dispatcher data hooks. Shapes come only from the shared contract.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  TBoardResponse, TCheckPlacementResponse, TDeferralReviewResponse, TDeferralReason, TForecastResponse, TLiveResponse,
  TOrderQueueResponse, TOverviewResponse, TPlanDto,
} from '@waypoint/shared/contract';
import { api } from '../../api';

const json = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

export const useOverview = () => useQuery({ queryKey: ['dispatch', 'overview'], queryFn: () => api<TOverviewResponse>('/overview') });
export const useQueue = () => useQuery({ queryKey: ['dispatch', 'orders'], queryFn: () => api<TOrderQueueResponse>('/orders') });
export const useBoard = () => useQuery({ queryKey: ['dispatch', 'board'], queryFn: () => api<TBoardResponse>('/board') });
export const useReview = () => useQuery({ queryKey: ['dispatch', 'deferrals'], queryFn: () => api<TDeferralReviewResponse>('/deferrals') });
export const useLive = () => useQuery({ queryKey: ['dispatch', 'live'], queryFn: () => api<TLiveResponse>('/live'), refetchInterval: 30_000 });
export const useForecast = () => useQuery({ queryKey: ['dispatch', 'forecast'], queryFn: () => api<TForecastResponse>('/forecast'), staleTime: 5 * 60_000 });

/** Any dispatcher write refreshes every dispatcher screen (they all read the same plan). */
function useWrite<A = void, R = unknown>(fn: (a: A) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSettled: () => qc.invalidateQueries({ queryKey: ['dispatch'] }) });
}

export const useSuggest = () => useWrite(() => api<{ planId: string; served: number; deferred: number; plan: TPlanDto | null }>('/plans/suggest', json({})));
export const useSaveTrips = () =>
  useWrite((trips: { vehicleId: string; tripNo: 1 | 2; orderIds: string[] }[]) => api<TPlanDto>('/plans/trips', { method: 'PUT', body: JSON.stringify({ trips }) }));
export const checkPlacement = (orderId: string, vehicleId: string, tripNo?: 1 | 2 | 'new') =>
  api<TCheckPlacementResponse>('/plans/check-placement', json({ orderId, vehicleId, tripNo }));
export const useDefer = () =>
  useWrite((a: { orderId: string; reason: TDeferralReason; note?: string; confirmSecondDeferral?: boolean }) =>
    api<TPlanDto | null>(`/orders/${a.orderId}/defer`, json({ reason: a.reason, note: a.note, confirmSecondDeferral: a.confirmSecondDeferral })));
export const useConfirmDeferral = () => useWrite((a: { id: string; note: string }) => api<{ id: string }>(`/deferrals/${a.id}/confirm`, json({ note: a.note })));
export const usePublish = () => useWrite(() => api<{ version: number }>('/plans/publish', json({})));
export const useOption = () => useWrite((id: 'A' | 'B' | 'C') => api<TDeferralReviewResponse>(`/deferrals/options/${id}`, json({})));
export const useAlertAction = () => useWrite((a: { id: string; action: string }) => api<{ ok: boolean }>(`/live/alerts/${a.id}/action`, json({ action: a.action })));
export const useSimulate = () => useWrite(() => api<{ delivered: number }>('/live/simulate', json({})));
