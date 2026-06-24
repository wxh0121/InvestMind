import type { DcaPlan, DeletedDcaPlan } from "../../src/types/dcaPlan.js";
import type { Holding } from "../../src/types/holding.js";
import type { PendingPositionAdjustment } from "../../src/types/positionAdjustment.js";
import type { PortfolioSnapshot } from "../../src/types/portfolio.js";
import type { BackupPayload } from "./dca.js";

const timestampMs = (value?: string | null) => {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
};

const isCashHolding = (holding: Holding) => holding.market === "CASH" || holding.assetType === "CASH";

const isExistingPlanAhead = (existing: DcaPlan, incoming?: DcaPlan) => {
  if (!existing.lastRunAt) return false;
  if (!incoming) return true;

  const existingUpdatedAt = Math.max(timestampMs(existing.updatedAt), timestampMs(existing.lastRunAt));
  if (timestampMs(incoming.updatedAt) >= existingUpdatedAt) return false;

  return (
    timestampMs(existing.lastRunAt) > timestampMs(incoming.lastRunAt) ||
    timestampMs(existing.nextRunAt) > timestampMs(incoming.nextRunAt)
  );
};

const isExistingAdjustmentAhead = (
  existing: PendingPositionAdjustment,
  incoming?: PendingPositionAdjustment
) => {
  if (!incoming) return true;
  if (existing.status === "PENDING") return false;
  if (incoming.status === "PENDING") return true;

  return timestampMs(existing.executedAt) > timestampMs(incoming.executedAt);
};

const mergeSnapshots = (
  existingSnapshots: PortfolioSnapshot[] = [],
  incomingSnapshots: PortfolioSnapshot[] = []
) => {
  const byId = new Map<string, PortfolioSnapshot>();

  for (const snapshot of incomingSnapshots) {
    byId.set(snapshot.id, snapshot);
  }
  for (const snapshot of existingSnapshots) {
    byId.set(snapshot.id, snapshot);
  }

  return Array.from(byId.values())
    .sort((first, second) => timestampMs(second.createdAt) - timestampMs(first.createdAt))
    .slice(0, 500);
};

const planUpdatedMs = (plan: DcaPlan) =>
  Math.max(timestampMs(plan.updatedAt), timestampMs(plan.lastRunAt), timestampMs(plan.createdAt));

const mergeDeletedDcaPlans = (
  existingDeletedPlans: DeletedDcaPlan[] = [],
  incomingDeletedPlans: DeletedDcaPlan[] = []
) => {
  const byId = new Map<string, DeletedDcaPlan>();

  for (const deleted of existingDeletedPlans) {
    byId.set(deleted.id, deleted);
  }
  for (const deleted of incomingDeletedPlans) {
    const current = byId.get(deleted.id);
    if (!current || timestampMs(deleted.deletedAt) >= timestampMs(current.deletedAt)) {
      byId.set(deleted.id, deleted);
    }
  }

  return Array.from(byId.values())
    .sort((first, second) => timestampMs(second.deletedAt) - timestampMs(first.deletedAt))
    .slice(0, 1000);
};

export const mergeCloudPortfolioPayload = (
  incoming: BackupPayload,
  existing: BackupPayload,
  now = new Date()
): BackupPayload => {
  const deletedDcaPlans = mergeDeletedDcaPlans(existing.deletedDcaPlans, incoming.deletedDcaPlans);
  const deletedPlanById = new Map(deletedDcaPlans.map((plan) => [plan.id, plan]));
  const isDeletedPlan = (plan: DcaPlan) => {
    const deleted = deletedPlanById.get(plan.id);
    return Boolean(deleted && timestampMs(deleted.deletedAt) >= planUpdatedMs(plan));
  };

  const incomingPlanList = (incoming.dcaPlans ?? []).filter((plan) => !isDeletedPlan(plan));
  const existingPlans = (existing.dcaPlans ?? []).filter((plan) => !isDeletedPlan(plan));
  const normalizedIncoming: BackupPayload = {
    ...incoming,
    dcaPlans: incomingPlanList.sort((first, second) => first.nextRunAt.localeCompare(second.nextRunAt)),
    deletedDcaPlans
  };
  const incomingPlans = new Map(incomingPlanList.map((plan) => [plan.id, plan]));
  const protectedPlanIds = new Set<string>();
  const protectedHoldingIds = new Set<string>();
  const protectedCashCurrencies = new Set<Holding["currency"]>();
  const existingHoldingsById = new Map(existing.holdings.map((holding) => [holding.id, holding]));

  for (const plan of existingPlans) {
    if (!isExistingPlanAhead(plan, incomingPlans.get(plan.id))) continue;
    protectedPlanIds.add(plan.id);
    protectedHoldingIds.add(plan.holdingId);
    const holding = existingHoldingsById.get(plan.holdingId);
    if (holding) protectedCashCurrencies.add(holding.currency);
  }

  const incomingAdjustments = new Map(
    (incoming.pendingPositionAdjustments ?? []).map((adjustment) => [adjustment.id, adjustment])
  );
  const existingAdjustments = existing.pendingPositionAdjustments ?? [];
  const protectedAdjustmentIds = new Set<string>();

  for (const adjustment of existingAdjustments) {
    if (!isExistingAdjustmentAhead(adjustment, incomingAdjustments.get(adjustment.id))) continue;
    protectedAdjustmentIds.add(adjustment.id);
    if (adjustment.status === "PENDING") continue;
    protectedHoldingIds.add(adjustment.holdingId);
    const holding = existingHoldingsById.get(adjustment.holdingId);
    if (holding) protectedCashCurrencies.add(holding.currency);
  }

  if (!protectedPlanIds.size && !protectedAdjustmentIds.size) {
    return normalizedIncoming;
  }

  const existingCashByCurrency = new Map(
    existing.holdings.filter(isCashHolding).map((holding) => [holding.currency, holding])
  );
  const outputHoldingIds = new Set<string>();
  const holdings = incoming.holdings.map((holding) => {
    const protectedHolding = protectedHoldingIds.has(holding.id)
      ? existingHoldingsById.get(holding.id)
      : undefined;
    const protectedCash = isCashHolding(holding) && protectedCashCurrencies.has(holding.currency)
      ? existingCashByCurrency.get(holding.currency)
      : undefined;
    const nextHolding = protectedHolding ?? protectedCash ?? holding;
    outputHoldingIds.add(nextHolding.id);
    return nextHolding;
  });

  for (const holding of existing.holdings) {
    const isProtectedHolding = protectedHoldingIds.has(holding.id);
    const isProtectedCash = isCashHolding(holding) && protectedCashCurrencies.has(holding.currency);
    if ((isProtectedHolding || isProtectedCash) && !outputHoldingIds.has(holding.id)) {
      holdings.push(holding);
      outputHoldingIds.add(holding.id);
    }
  }

  const dcaPlans = new Map(incomingPlanList.map((plan) => [plan.id, plan]));
  for (const plan of existingPlans) {
    if (protectedPlanIds.has(plan.id)) {
      dcaPlans.set(plan.id, plan);
    }
  }

  const pendingPositionAdjustments = new Map(
    (incoming.pendingPositionAdjustments ?? []).map((adjustment) => [adjustment.id, adjustment])
  );
  for (const adjustment of existingAdjustments) {
    if (protectedAdjustmentIds.has(adjustment.id)) {
      pendingPositionAdjustments.set(adjustment.id, adjustment);
    }
  }

  return {
    ...incoming,
    exportedAt: now.toISOString(),
    holdings,
    dcaPlans: Array.from(dcaPlans.values()).sort((first, second) =>
      first.nextRunAt.localeCompare(second.nextRunAt)
    ),
    deletedDcaPlans,
    pendingPositionAdjustments: Array.from(pendingPositionAdjustments.values()).sort((first, second) =>
      first.executeAt.localeCompare(second.executeAt)
    ),
    snapshots: mergeSnapshots(existing.snapshots, incoming.snapshots)
  };
};
