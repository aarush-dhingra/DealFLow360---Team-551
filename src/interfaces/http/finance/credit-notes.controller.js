/**
 * Finance credit-note HTTP controller (thin; rules live in the domain service).
 */

import {
  issueCreditNote,
  applyCreditNote
} from '../../../domains/finance/credit-notes/service.js';
import { asyncHandler } from './middleware.js';
import { parse, invoiceParams, issueCreditNoteBody, creditNoteParams } from './schemas.js';

export const issueCreditNoteController = asyncHandler(async (req, res) => {
  const params = parse(invoiceParams, req.params);
  const body = parse(issueCreditNoteBody, req.body);

  const result = await issueCreditNote({
    invoiceId: params.invoiceId,
    amount: body.amount,
    reason: body.reason,
    principal: req.principal
  });

  res.status(200).json({ data: result });
});

export const applyCreditNoteController = asyncHandler(async (req, res) => {
  const params = parse(creditNoteParams, req.params);
  const result = await applyCreditNote({
    creditNoteId: params.creditNoteId,
    principal: req.principal
  });
  res.status(200).json({ data: result });
});
