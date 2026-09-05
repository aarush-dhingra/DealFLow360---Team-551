export type BackendApprovalRoute = 'none' | 'manager' | 'manager_then_finance' | 'finance_direct';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export function routeToRisk(route: BackendApprovalRoute): RiskLevel { return route === 'none' ? 'LOW' : route === 'manager' ? 'MEDIUM' : 'HIGH'; }
