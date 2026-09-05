import { ValidationError } from './errors.js';

export function validate(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ValidationError('Invalid input', result.error.flatten().fieldErrors);
  }
  return result.data;
}

export function validateQuery(schema, query) {
  const result = schema.safeParse(query);
  if (!result.success) {
    throw new ValidationError('Invalid query parameters', result.error.flatten().fieldErrors);
  }
  return result.data;
}
