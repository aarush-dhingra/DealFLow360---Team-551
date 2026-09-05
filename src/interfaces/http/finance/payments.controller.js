/**
 * Finance payment HTTP controller (thin; rules live in the domain service).
 */

import { applyPayment, voidInvoice } from '../../../domains/finance/payments/service.js';
import { asyncHandler } from './middleware.js';
import { parse, invoiceParams, applyPaymentBody, voidInvoiceBody } from './schemas.js';

export const applyPaymentController = asyncHandler(async (req, res) => {
  const params = parse(invoiceParams, req.params);
  const body = parse(applyPaymentBody, req.body);

  const result = await applyPayment({
    invoiceId: params.invoiceId,
    amount: body.amount,
    method: body.method,
    externalReference: body.externalReference,
    principal: req.principal
  });

  res.status(200).json({ data: result });
});

export const voidInvoiceController = asyncHandler(async (req, res) => {
  const params = parse(invoiceParams, req.params);
  const body = parse(voidInvoiceBody, req.body);
  const result = await voidInvoice({
    invoiceId: params.invoiceId,
    reason: body.reason,
    principal: req.principal
  });
  res.status(200).json({ data: result });
});
