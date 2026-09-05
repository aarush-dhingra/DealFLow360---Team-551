// Request contracts owned by the Admin API.
import { z } from 'zod';

const money = z.coerce.number().finite().min(0).max(999999999999999);
const percent = z.coerce.number().finite().min(0).max(100);
const uuid = z.string().uuid();

export const idParams = z.object({ id: uuid });
export const customerSchema = z.object({ legalName: z.string().trim().min(1).max(250), tierId: uuid, currencyCode: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/) });
export const contactSchema = z.object({ email: z.string().email().max(320).transform((value) => value.toLowerCase()), displayName: z.string().trim().min(1).max(150) });
export const tierSchema = z.object({ displayName: z.string().trim().min(1).max(100), entitlementDiscountPercent: percent, isActive: z.boolean().optional() });
export const categorySchema = z.object({ displayName: z.string().trim().min(1).max(100), discountCeilingPercent: percent, isActive: z.boolean().optional() });
export const productSchema = z.object({ sku: z.string().trim().min(1).max(80), name: z.string().trim().min(1).max(200), categoryId: uuid, description: z.string().trim().max(4000).nullable().optional(), unitName: z.string().trim().min(1).max(50).default('unit'), listPrice: money, standardCost: money, taxPercent: percent.default(0), billingKind: z.enum(['one_time', 'recurring']).default('one_time'), isActive: z.boolean().default(true) }).refine((value) => value.standardCost <= value.listPrice || value.listPrice === 0, { message: 'Standard cost cannot exceed list price for a sellable product.', path: ['standardCost'] });
export const variantSchema = z.object({ sku: z.string().trim().min(1).max(80), attributes: z.record(z.string(), z.string()).default({}), extraPrice: money.default(0), isActive: z.boolean().default(true) });
export const priceListSchema = z.object({ name: z.string().trim().min(1).max(150), tierId: uuid.nullable().optional(), currencyCode: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/), isActive: z.boolean().default(true) });
export const priceListItemSchema = z.object({ productId: uuid, unitPrice: money, validFrom: z.coerce.date().nullable().optional(), validTo: z.coerce.date().nullable().optional() }).refine((value) => !value.validFrom || !value.validTo || value.validTo > value.validFrom, { message: 'validTo must be after validFrom.' });
export const approvalPolicySchema = z.object({ managerMaxBlendedRiskPercent: percent, highRiskRoute: z.enum(['manager_then_finance', 'finance_direct']) });
export const healthPolicySchema = z.object({ turnPoints: percent, turnPointsCap: percent, quoteAgeDayPoints: percent, quoteAgePointsCap: percent, inactivityDayPoints: percent, inactivityPointsCap: percent, warningThreshold: percent, managerThreshold: percent, financeThreshold: percent }).refine((value) => value.warningThreshold <= value.managerThreshold && value.managerThreshold <= value.financeThreshold, { message: 'Thresholds must be warning <= manager <= finance.' });
export const warehouseSchema = z.object({ code: z.string().trim().min(1).max(40), name: z.string().trim().min(1).max(150), shippingCostWeight: money.default(0), isActive: z.boolean().default(true) });
export const inventoryAdjustmentSchema = z.object({ productId: uuid, deltaQuantity: z.coerce.number().finite().refine((value) => value !== 0), reason: z.string().trim().min(3).max(500) });
export const planSchema = z.object({ code: z.string().trim().min(1).max(60), name: z.string().trim().min(1).max(150), intervalUnit: z.enum(['month', 'quarter', 'year']), prorationPolicy: z.record(z.unknown()).default({}), cancellationPolicy: z.record(z.unknown()).default({}), isActive: z.boolean().default(true) });
export const upsellRuleSchema = z.object({ triggerProductId: uuid, suggestedProductId: uuid, ruleKind: z.enum(['upsell', 'cross_sell']), rankWeight: z.coerce.number().int().min(-10000).max(10000).default(0), promotionTag: z.string().trim().max(100).nullable().optional(), minimumMarginPercent: percent.default(0), activeFrom: z.coerce.date().nullable().optional(), activeTo: z.coerce.date().nullable().optional(), isActive: z.boolean().default(true) }).refine((value) => value.triggerProductId !== value.suggestedProductId, { message: 'Trigger and suggested product must differ.' }).refine((value) => !value.activeFrom || !value.activeTo || value.activeTo > value.activeFrom, { message: 'activeTo must be after activeFrom.' });
