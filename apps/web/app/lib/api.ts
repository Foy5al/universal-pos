import type {
  Brand,
  CashMovement,
  Category,
  CreateBrandRequest,
  CreateProductRequest,
  CreateStockAdjustmentRequest,
  CreateStockLossRequest,
  LoginRequest,
  Page,
  CreatePurchaseOrderRequest,
  CreateRestockRequest,
  CreateSupplierRequest,
  Device,
  Product,
  PurchaseOrder,
  PurchaseReceiveResult,
  ReceivePurchaseOrderRequest,
  Refund,
  Register,
  RegisterDeviceRequest,
  RegisterShift,
  RestockRequest,
  RestockRequestStatus,
  Sale,
  SaleListQuery,
  SalesSummary,
  SessionUser,
  ShiftReport,
  StockBalance,
  StockLocation,
  StockLossReason,
  StockMovement,
  StoreActivity,
  Supplier,
  SyncConflict,
  SyncPullResponse,
  SyncPushRequest,
  SyncPushResponse,
  Unit,
} from '@pos/contracts';

const TOKEN_KEY = 'pos.session.token';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function getToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH';
  body?: unknown;
  token?: string | null;
}

async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = options.token ?? getToken();
  const headers: Record<string, string> = { accept: 'application/json' };
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
  }
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  const response = await fetch(`/api${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const payload = (await response.json().catch(() => null)) as {
    data?: T;
    error?: { code?: string; message?: string };
  } | null;

  if (!response.ok) {
    throw new ApiError(
      payload?.error?.message ?? `Request failed (${response.status})`,
      payload?.error?.code ?? 'internal_error',
      response.status,
    );
  }
  return payload?.data as T;
}

export interface SessionResponse {
  user: SessionUser;
}

export function login(body: LoginRequest): Promise<{ token: string; user: SessionUser }> {
  return apiFetch('/auth/login', { method: 'POST', body, token: null });
}

export function fetchSession(token: string): Promise<SessionResponse> {
  return apiFetch('/auth/session', { token });
}

export function logout(): Promise<void> {
  return apiFetch('/auth/logout', { method: 'POST' });
}

export function listProducts(): Promise<Page<Product>> {
  return apiFetch('/catalog/products?limit=200');
}

export function listCategories(): Promise<Page<Category>> {
  return apiFetch('/catalog/categories?limit=200');
}

export function listBrands(): Promise<Page<Brand>> {
  return apiFetch('/catalog/brands?limit=200');
}

export function listUnits(): Promise<Page<Unit>> {
  return apiFetch('/catalog/units?limit=200');
}

export function createProduct(body: CreateProductRequest): Promise<Product> {
  return apiFetch('/catalog/products', { method: 'POST', body });
}

export function createBrand(body: CreateBrandRequest): Promise<Brand> {
  return apiFetch('/catalog/brands', { method: 'POST', body });
}

export interface StockAdjustmentResult {
  movement: StockMovement;
  balance: StockBalance;
}

export function createStockAdjustment(
  body: CreateStockAdjustmentRequest,
): Promise<StockAdjustmentResult> {
  return apiFetch('/inventory/adjustments', { method: 'POST', body });
}

export function createStockLoss(body: CreateStockLossRequest): Promise<StockAdjustmentResult> {
  return apiFetch('/inventory/losses', { method: 'POST', body });
}

export function listStockLosses(
  locationId: string,
  reason?: StockLossReason,
): Promise<Page<StockMovement>> {
  const params = new URLSearchParams({ limit: '100', locationId });
  if (reason) params.set('reason', reason);
  return apiFetch(`/inventory/losses?${params.toString()}`);
}

export function listLocations(): Promise<Page<StockLocation>> {
  return apiFetch('/inventory/locations?limit=200');
}

export function listBalances(locationId: string): Promise<Page<StockBalance>> {
  return apiFetch(`/inventory/balances?limit=200&locationId=${encodeURIComponent(locationId)}`);
}

export function listRegisters(): Promise<Page<Register>> {
  return apiFetch('/registers?limit=200');
}

export function currentShift(registerId: string): Promise<RegisterShift | null> {
  return apiFetch(`/register-shifts/current?registerId=${encodeURIComponent(registerId)}`);
}

export function openShift(body: {
  registerId: string;
  openingFloatMinor: number;
}): Promise<RegisterShift> {
  return apiFetch('/register-shifts', { method: 'POST', body });
}

export function addCashMovement(
  shiftId: string,
  body: { type: 'in' | 'out'; amountMinor: number; reason: string },
): Promise<CashMovement> {
  return apiFetch(`/register-shifts/${shiftId}/cash-movements`, { method: 'POST', body });
}

export function closeShift(
  shiftId: string,
  body: { countedCashMinor: number; notes?: string },
): Promise<RegisterShift> {
  return apiFetch(`/register-shifts/${shiftId}/close`, { method: 'POST', body });
}

export function createSale(body: unknown): Promise<Sale> {
  return apiFetch('/sales', { method: 'POST', body });
}

export function getSale(id: string): Promise<Sale> {
  return apiFetch(`/sales/${encodeURIComponent(id)}`);
}

export function pushSync(body: SyncPushRequest): Promise<SyncPushResponse> {
  return apiFetch('/sync/push', { method: 'POST', body });
}

export function pullSync(query: {
  deviceId: string;
  cursor: number;
  limit?: number;
}): Promise<SyncPullResponse> {
  const params = new URLSearchParams({
    deviceId: query.deviceId,
    cursor: String(query.cursor),
  });
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  return apiFetch(`/sync/pull?${params.toString()}`);
}

export function listDevices(): Promise<Device[]> {
  return apiFetch('/devices');
}

export function registerDevice(body: RegisterDeviceRequest): Promise<Device> {
  return apiFetch('/devices', { method: 'POST', body });
}

export function revokeDevice(id: string): Promise<Device> {
  return apiFetch(`/devices/${encodeURIComponent(id)}/revoke`, { method: 'POST' });
}

export function listSyncConflicts(limit = 50): Promise<SyncConflict[]> {
  return apiFetch(`/sync/conflicts?limit=${limit}`);
}

export function listSales(query: SaleListQuery = { limit: 20, offset: 0 }): Promise<Page<Sale>> {
  return apiFetch(`/sales?limit=${query.limit}&offset=${query.offset}`);
}

export function refundSale(
  saleId: string,
  body: { operationId: string; registerShiftId: string; reason: string },
): Promise<Refund> {
  return apiFetch(`/sales/${saleId}/refunds`, { method: 'POST', body });
}

export function fetchSalesSummary(query: {
  from: string;
  to: string;
  locationId?: string;
}): Promise<SalesSummary> {
  const params = new URLSearchParams({ from: query.from, to: query.to });
  if (query.locationId) params.set('locationId', query.locationId);
  return apiFetch(`/reports/sales-summary?${params.toString()}`);
}

export function fetchShiftReport(shiftId: string): Promise<ShiftReport> {
  return apiFetch(`/reports/shifts/${encodeURIComponent(shiftId)}`);
}

export function fetchStoreActivity(query: {
  from: string;
  to: string;
  locationId?: string;
}): Promise<StoreActivity> {
  const params = new URLSearchParams({ from: query.from, to: query.to });
  if (query.locationId) params.set('locationId', query.locationId);
  return apiFetch(`/reports/store-activity?${params.toString()}`);
}

export function listSuppliers(): Promise<Page<Supplier>> {
  return apiFetch('/purchases/suppliers?limit=200');
}

export function createSupplier(body: CreateSupplierRequest): Promise<Supplier> {
  return apiFetch('/purchases/suppliers', { method: 'POST', body });
}

export function listPurchaseOrders(): Promise<Page<PurchaseOrder>> {
  return apiFetch('/purchases/orders?limit=200');
}

export function listRestockRequests(status?: RestockRequestStatus): Promise<Page<RestockRequest>> {
  const params = new URLSearchParams({ limit: '200' });
  if (status) params.set('status', status);
  return apiFetch(`/restock-requests?${params.toString()}`);
}

export function createRestockRequest(body: CreateRestockRequest): Promise<RestockRequest> {
  return apiFetch('/restock-requests', { method: 'POST', body });
}

export function dismissRestockRequest(id: string): Promise<RestockRequest> {
  return apiFetch(`/restock-requests/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { status: 'dismissed' },
  });
}

export function createPurchaseOrder(body: CreatePurchaseOrderRequest): Promise<PurchaseOrder> {
  return apiFetch('/purchases/orders', { method: 'POST', body });
}

export function updatePurchaseOrderStatus(
  id: string,
  status: 'ordered' | 'cancelled',
): Promise<PurchaseOrder> {
  return apiFetch(`/purchases/orders/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    body: { status },
  });
}

export function receivePurchaseOrder(
  id: string,
  body: ReceivePurchaseOrderRequest,
): Promise<PurchaseReceiveResult> {
  return apiFetch(`/purchases/orders/${encodeURIComponent(id)}/receipts`, {
    method: 'POST',
    body,
  });
}
