// Store manager data hooks. Shapes come only from the shared contract.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  TStoreCatalogueResponse, TStoreNotificationDto, TStoreOrderDetail, TStoreOrdersResponse, TStoreReceiptsResponse, TStoreTodayResponse,
} from '@waypoint/shared/contract';
import { api } from '../../api';

const post = (body: unknown = {}): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

export const useToday = () => useQuery({ queryKey: ['store', 'today'], queryFn: () => api<TStoreTodayResponse>('/store/today'), refetchInterval: 30_000 });
export const useCatalogue = (temp: string) => useQuery({ queryKey: ['store', 'catalogue', temp], queryFn: () => api<TStoreCatalogueResponse>(`/store/catalogue?temp=${temp}`) });
export const useOrders = () => useQuery({ queryKey: ['store', 'orders'], queryFn: () => api<TStoreOrdersResponse>('/store/orders') });
export const useOrder = (id: string) => useQuery({ queryKey: ['store', 'order', id], queryFn: () => api<TStoreOrderDetail>(`/store/orders/${id}`), refetchInterval: 30_000 });
export const useReceipts = () => useQuery({ queryKey: ['store', 'receipts'], queryFn: () => api<TStoreReceiptsResponse>('/store/receipts') });
export const useNotifications = () => useQuery({ queryKey: ['store', 'notifications'], queryFn: () => api<TStoreNotificationDto[]>('/store/notifications') });

function useWrite<A = void, R = unknown>(fn: (a: A) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSettled: () => qc.invalidateQueries({ queryKey: ['store'] }) });
}
export const usePlaceOrder = () => useWrite((a: { temp: string; lines: { product: string; packs: number }[]; note?: string }) => api<TStoreOrderDetail>('/store/orders', post(a)));
export const useAddProduct = () => useWrite((a: { temp: string; name: string; pack: string; packSize: string; perPack: number; perPackUnit: string; packKg: number; packM3: number }) =>
  api<{ ok: boolean }>('/store/catalogue/products', post(a)));
export const useConfirmReceipt = () => useWrite((a: { orderId: string; lines: { lineId: string; received: number; status: 'ok' | 'short' | 'damaged' }[]; note?: string }) =>
  api<TStoreOrderDetail>(`/store/orders/${a.orderId}/receipt`, post({ lines: a.lines, note: a.note })));
export const useDeferralResponse = () => useWrite((a: { orderId: string; action: 'accept' | 'cancel' }) => api<TStoreOrderDetail>(`/store/orders/${a.orderId}/deferral`, post({ action: a.action })));
export const useMarkRead = () => useWrite(() => api<{ ok: boolean }>('/store/notifications/read', post()));

export const DISPATCH_PHONE = '+94 11 555 0142';
