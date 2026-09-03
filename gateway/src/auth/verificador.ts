import { createRemoteJWKSet, jwtVerify } from 'jose';

const ISSUER    = process.env.COGNITO_ISSUER!;
const CLIENT_ID = process.env.COGNITO_CLIENT_ID!;

// Se baja el JWKS una vez y lo cachea. Si aparece un kid nuevo, lo vuelve a pedir solo.
const jwks = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`));

export type Claims = {
  sub: string;
  scope: string;
  client_id: string;
  token_use: string;
  'cognito:groups'?: string[];
};

export async function verificar(cabecera?: string): Promise<Claims> {
  if (!cabecera?.startsWith('Bearer ')) {
    throw new Error('sin token');           // → 401
  }

  // 1 · Firma, iss, exp y nbf: los revisa jwtVerify. Si algo falla, lanza.
  const { payload } = await jwtVerify(cabecera.slice(7), jwks, { issuer: ISSUER });

  // 2 · ¿Es del tipo correcto? Un id_token presentado como access_token es un ataque.
  if (payload.token_use !== 'access') {
    throw new Error('no es un access token');   // → 401
  }

  // 3 · ¿Salió de un app client que reconozco? Dato complementario, no autorización.
  if (payload.client_id !== CLIENT_ID) {
    throw new Error('app client desconocido');  // → 401
  }

  return payload as unknown as Claims;
}

// 4 · La autorización de verdad: ¿qué le permite hacer este token?
export function tieneScope(claims: Claims, requerido: string): boolean {
  return (claims.scope ?? '').split(' ').includes(requerido);
}

// 5 · Y el rol, cuando la decisión depende de quién es y no de qué pidió la app.
export function estaEnGrupo(claims: Claims, grupo: string): boolean {
  return (claims['cognito:groups'] ?? []).includes(grupo);
}