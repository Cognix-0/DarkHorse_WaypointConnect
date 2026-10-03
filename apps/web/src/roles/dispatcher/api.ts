// Dispatcher data hooks. Shapes come only from the shared contract.
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  TBoardResponse, TCheckPlacementResponse, TDeferralReviewResponse, TDeferralReason, TForecastResponse, TLiveResponse,
  TOrderQueueResponse, TOverviewResponse, TPlanDto,
} from '@waypoint/shared/contract';
import { api } from '../../api';

export type Depot = 'Peliyagoda' | 'Kandy';

let currentDepot: Depot = (localStorage.getItem('waypoint_dispatcher_depot') as Depot) || 'Peliyagoda';
const depotListeners = new Set<(depot: Depot) => void>();

export function getDispatcherDepot(): Depot {
  return currentDepot;
}

export function setDispatcherDepot(depot: Depot) {
  currentDepot = depot;
  localStorage.setItem('waypoint_dispatcher_depot', depot);
  depotListeners.forEach((fn) => fn(depot));
}

export function useDispatcherDepot(): [Depot, (depot: Depot) => void] {
  const [depot, setDepot] = useState<Depot>(currentDepot);
  useEffect(() => {
    const handler = (d: Depot) => setDepot(d);
    depotListeners.add(handler);
    return () => { depotListeners.delete(handler); };
  }, []);
  return [depot, setDispatcherDepot];
}

const json = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

export const useOverview = () => {
  const [depot] = useDispatcherDepot();
  return useQuery({ queryKey: ['dispatch', depot, 'overview'], queryFn: () => api<TOverviewResponse>(`/overview?depot=${depot}`) });
};

export const useQueue = () => {
  const [depot] = useDispatcherDepot();
  return useQuery({ queryKey: ['dispatch', depot, 'orders'], queryFn: () => api<TOrderQueueResponse>(`/orders?depot=${depot}`) });
};

export const useBoard = () => {
  const [depot] = useDispatcherDepot();
  return useQuery({ queryKey: ['dispatch', depot, 'board'], queryFn: () => api<TBoardResponse>(`/board?depot=${depot}`) });
};

export const useReview = () => {
  const [depot] = useDispatcherDepot();
  return useQuery({ queryKey: ['dispatch', depot, 'deferrals'], queryFn: () => api<TDeferralReviewResponse>(`/deferrals?depot=${depot}`) });
};

export const useLive = () => {
  const [depot] = useDispatcherDepot();
  return useQuery({ queryKey: ['dispatch', depot, 'live'], queryFn: () => api<TLiveResponse>(`/live?depot=${depot}`), refetchInterval: 30_000 });
};

export const useForecast = () => {
  const [depot] = useDispatcherDepot();
  return useQuery({ queryKey: ['dispatch', depot, 'forecast'], queryFn: () => api<TForecastResponse>(`/forecast?depot=${depot}`), staleTime: 5 * 60_000 });
};

/** Any dispatcher write refreshes every dispatcher screen (they all read the same plan). */
function useWrite<A = void, R = unknown>(fn: (a: A) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSettled: () => qc.invalidateQueries({ queryKey: ['dispatch'] }) });
}

export const useSuggest = () => useWrite(() => api<{ planId: string; served: number; deferred: number; plan: TPlanDto | null }>(`/plans/suggest?depot=${getDispatcherDepot()}`, json({})));
export const useSaveTrips = () =>
  useWrite((trips: { vehicleId: string; tripNo: 1 | 2; orderIds: string[] }[]) => api<TPlanDto>(`/plans/trips?depot=${getDispatcherDepot()}`, { method: 'PUT', body: JSON.stringify({ trips }) }));
export const checkPlacement = (orderId: string, vehicleId: string, tripNo?: 1 | 2 | 'new') =>
  api<TCheckPlacementResponse>(`/plans/check-placement?depot=${getDispatcherDepot()}`, json({ orderId, vehicleId, tripNo }));
export const useDefer = () =>
  useWrite((a: { orderId: string; reason: TDeferralReason; note?: string; confirmSecondDeferral?: boolean }) =>
    api<TPlanDto | null>(`/orders/${a.orderId}/defer?depot=${getDispatcherDepot()}`, json({ reason: a.reason, note: a.note, confirmSecondDeferral: a.confirmSecondDeferral })));
export const useConfirmDeferral = () => useWrite((a: { id: string; note: string }) => api<{ id: string }>(`/deferrals/${a.id}/confirm?depot=${getDispatcherDepot()}`, json({ note: a.note })));
export const usePublish = () => useWrite(() => api<{ version: number }>(`/plans/publish?depot=${getDispatcherDepot()}`, json({})));
export const useOption = () => useWrite((id: 'A' | 'B' | 'C') => api<TDeferralReviewResponse>(`/deferrals/options/${id}?depot=${getDispatcherDepot()}`, json({})));
export const useAlertAction = () => useWrite((a: { id: string; action: string }) => api<{ ok: boolean }>(`/live/alerts/${a.id}/action?depot=${getDispatcherDepot()}`, json({ action: a.action })));
export const useSimulate = () => useWrite(() => api<{ delivered: number }>(`/live/simulate?depot=${getDispatcherDepot()}`, json({})));
