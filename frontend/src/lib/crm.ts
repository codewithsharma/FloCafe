/**
 * R7 Customer & CRM OS API helpers (frontend).
 */

import api from '@/lib/api';

export async function fetchCustomerCrm(customerId: string) {
  const { data } = await api.get(`/customers/${customerId}/crm`);
  return data.crm;
}

export async function fetchCrmMetrics() {
  const { data } = await api.get('/customers/metrics');
  return data.metrics;
}

export async function fetchCustomerNotes(customerId: string) {
  const { data } = await api.get(`/customers/${customerId}/notes`);
  return data.notes as Array<Record<string, unknown>>;
}

export async function createCustomerNote(customerId: string, body: string) {
  const { data } = await api.post(`/customers/${customerId}/notes`, { body });
  return data.note;
}

export async function updateCustomerNote(customerId: string, noteId: string, body: string) {
  const { data } = await api.put(`/customers/${customerId}/notes/${noteId}`, { body });
  return data.note;
}

export async function deleteCustomerNote(customerId: string, noteId: string) {
  await api.delete(`/customers/${customerId}/notes/${noteId}`);
}
