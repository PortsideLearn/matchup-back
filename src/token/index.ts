import jwt from 'jsonwebtoken'
import { NextFunction, Request } from 'express'
import { JWT_SECRET, JWT_OPTIONS } from '../configs/jwt_token'

export function validateToken(req: Request, _: unknown, next: NextFunction) {
  let token = getTokenFromRequest(req)
  if (!token) next(Error('token required'))

  try {
    let dataFromToken = jwt.verify(token as string, JWT_SECRET)
    req.body.payload = dataFromToken
    return next()
  } catch (e) {
    next(Error('invalid token'))
  }
}

function getTokenFromRequest(req: Request) {
  if (hasToken(req)) {
    return req.headers.authorization!.split(' ')[1]
  }
  return null
}

function hasToken(req: Request) {
  if (
    (req.headers.authorization && req.headers.authorization.split(' ')[0] === 'Bearer') ||
    (req.headers.authorization && req.headers.authorization.split(' ')[0] === 'Token')
  )
    return true

  return false
}

export function generateToken(payload: Object) {
  return jwt.sign(payload, JWT_SECRET, JWT_OPTIONS)
}
