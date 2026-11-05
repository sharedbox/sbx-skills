import { Request } from 'express';
import { Principal } from '../../application/principal';

export interface AuthenticatedRequest extends Request {
  principal?: Principal;
}
