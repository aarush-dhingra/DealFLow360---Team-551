import * as dealHealthSvc from '../../../domains/deal-health/service.js';

export async function getDashboard(_req, res, next) {
  try {
    res.json(await dealHealthSvc.getDealHealthDashboard());
  } catch (err) { next(err); }
}

export async function assessQuotation(req, res, next) {
  try {
    res.json({ health: await dealHealthSvc.assessDealHealth(req.params.id) });
  } catch (err) { next(err); }
}

export async function nudgeSalesRep(req, res, next) {
  try {
    res.json(await dealHealthSvc.nudgeRep(req.params.id, req.user.id));
  } catch (err) { next(err); }
}
