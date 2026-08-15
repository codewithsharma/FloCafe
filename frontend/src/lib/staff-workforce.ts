/**
 * R8 Staff & Workforce OS — frontend helpers.
 */

import api from '@/lib/api';

export async function fetchStaffDetail(staffId: string) {
  const { data } = await api.get(`/staff/${staffId}`);
  return data.staff as Record<string, unknown>;
}

export async function fetchWorkingStaff() {
  const { data } = await api.get('/staff/working');
  return (data.working || []) as Array<Record<string, unknown>>;
}
