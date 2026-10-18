import { useQuery } from '@tanstack/react-query';
import { qk } from '../../app/queryClient';
import { rpc } from '../../lib/api/client';
import type { ReportFilters, TrendBucket } from '../../lib/api/types';

export function useDashboardSummary(filters: ReportFilters) {
  return useQuery({ queryKey: qk.reports.of('summary', filters), queryFn: () => rpc('dashboard_summary', { p_filters: filters }) });
}

export function useSalesTrend(filters: ReportFilters, bucket: TrendBucket | null = null) {
  return useQuery({
    queryKey: qk.reports.of('trend', { ...filters, bucket }),
    queryFn: () => rpc('sales_trend', { p_filters: filters, p_bucket: bucket }),
  });
}

export function useProductPerformance(filters: ReportFilters, sort: 'qty' | 'revenue' | 'profit', limit = 10, enabled = true) {
  return useQuery({
    queryKey: qk.reports.of('products', { ...filters, sort, limit }),
    queryFn: () => rpc('product_performance', { p_filters: filters, p_sort: sort, p_limit: limit }),
    enabled,
  });
}

export function useCategoryBreakdown(filters: ReportFilters) {
  return useQuery({ queryKey: qk.reports.of('categories', filters), queryFn: () => rpc('category_breakdown', { p_filters: filters }) });
}

export function usePaymentBreakdown(filters: ReportFilters) {
  return useQuery({ queryKey: qk.reports.of('payments', filters), queryFn: () => rpc('payment_breakdown', { p_filters: filters }) });
}

export function useCashierBreakdown(filters: ReportFilters) {
  return useQuery({ queryKey: qk.reports.of('cashiers', filters), queryFn: () => rpc('cashier_breakdown', { p_filters: filters }) });
}

export function useSlowMovers(limit = 10) {
  return useQuery({ queryKey: qk.reports.of('slow', { limit }), queryFn: () => rpc('slow_movers', { p_limit: limit }) });
}
