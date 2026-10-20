'use client';

import type {
  CreatePurchaseOrderRequest,
  Page,
  Product,
  PurchaseOrder,
  PurchaseReceiveResult,
  ReceivePurchaseOrderRequest,
  RestockRequest,
  StockLocation,
  Supplier,
} from '@pos/contracts';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import {
  ApiError,
  clearToken,
  createPurchaseOrder,
  createSupplier,
  dismissRestockRequest,
  fetchSession,
  getToken,
  listLocations,
  listProducts,
  listPurchaseOrders,
  listRestockRequests,
  listSuppliers,
  receivePurchaseOrder,
  updatePurchaseOrderStatus,
} from '../lib/api';

export function usePurchasing() {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [restockRequests, setRestockRequests] = useState<RestockRequest[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace('/login');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const session = await fetchSession(token);
        if (cancelled) return;
        setCanManage(session.user.permissions.includes('purchases:manage'));
        const [supplierPage, orderPage, productPage, locationPage, restockPage]: [
          Page<Supplier>,
          Page<PurchaseOrder>,
          Page<Product>,
          Page<StockLocation>,
          Page<RestockRequest>,
        ] = await Promise.all([
          listSuppliers(),
          listPurchaseOrders(),
          listProducts(),
          listLocations(),
          listRestockRequests(),
        ]);
        if (cancelled) return;
        setSuppliers(supplierPage.items);
        setOrders(orderPage.items);
        setProducts(productPage.items);
        setLocations(locationPage.items);
        setRestockRequests(restockPage.items);
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 401) {
          clearToken();
          router.replace('/login');
          return;
        }
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Could not load purchasing data');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const addSupplier = useCallback(async (name: string): Promise<Supplier> => {
    setBusy(true);
    try {
      const supplier = await createSupplier({ name });
      setSuppliers((current) =>
        [...current, supplier].sort((left, right) => left.name.localeCompare(right.name)),
      );
      return supplier;
    } finally {
      setBusy(false);
    }
  }, []);

  const addOrder = useCallback(
    async (input: CreatePurchaseOrderRequest): Promise<PurchaseOrder> => {
      setBusy(true);
      try {
        const order = await createPurchaseOrder(input);
        setOrders((current) => [order, ...current]);
        return order;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const refreshRestock = useCallback(async (): Promise<void> => {
    const result = await listRestockRequests();
    setRestockRequests(result.items);
  }, []);

  const dismissRestock = useCallback(async (id: string): Promise<RestockRequest> => {
    setBusy(true);
    try {
      const updated = await dismissRestockRequest(id);
      setRestockRequests((current) =>
        current.map((request) => (request.id === updated.id ? updated : request)),
      );
      return updated;
    } finally {
      setBusy(false);
    }
  }, []);

  const changeStatus = useCallback(
    async (orderId: string, status: 'ordered' | 'cancelled'): Promise<PurchaseOrder> => {
      setBusy(true);
      try {
        const updated = await updatePurchaseOrderStatus(orderId, status);
        setOrders((current) => current.map((order) => (order.id === updated.id ? updated : order)));
        return updated;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const receive = useCallback(
    async (orderId: string, input: ReceivePurchaseOrderRequest): Promise<PurchaseReceiveResult> => {
      setBusy(true);
      try {
        const result = await receivePurchaseOrder(orderId, input);
        setOrders((current) =>
          current.map((order) =>
            order.id === result.purchaseOrder.id ? result.purchaseOrder : order,
          ),
        );
        return result;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  return {
    suppliers,
    orders,
    restockRequests,
    products,
    locations,
    loading,
    busy,
    error,
    setError,
    canManage,
    addSupplier,
    addOrder,
    refreshRestock,
    dismissRestock,
    changeStatus,
    receive,
  };
}
