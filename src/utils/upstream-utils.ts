interface GoogleOAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  id_token?: string;
  scope?: string;
}

/**
 * Constructs an authorization URL for an upstream service.
 *
 * @param {Object} options
 * @param {string} options.upstream_url - The base URL of the upstream service.
 * @param {string} options.client_id - The client ID of the application.
 * @param {string} options.redirect_uri - The redirect URI of the application.
 * @param {string} [options.state] - The state parameter.
 *
 * @returns {string} The authorization URL.
 */
export function getUpstreamAuthorizeUrl({
  upstream_url,
  client_id,
  scope,
  redirect_uri,
  state,
}: {
  upstream_url: string;
  client_id: string;
  scope: string;
  redirect_uri: string;
  state?: string;
}) {
  const upstream = new URL(upstream_url);
  upstream.searchParams.set("client_id", client_id);
  upstream.searchParams.set("redirect_uri", redirect_uri);
  upstream.searchParams.set("scope", scope);
  if (state) upstream.searchParams.set("state", state);
  upstream.searchParams.set("response_type", "code");
  return upstream.href;
}

/**
 * Fetches an authorization token from an upstream service.
 *
 * @param {Object} options
 * @param {string} options.client_id - The client ID of the application.
 * @param {string} options.client_secret - The client secret of the application.
 * @param {string} options.code - The authorization code.
 * @param {string} options.redirect_uri - The redirect URI of the application.
 * @param {string} options.upstream_url - The token endpoint URL of the upstream service.
 *
 * @returns {Promise<[string, null] | [null, Response]>} A promise that resolves to an array containing the access token or an error response.
 */
export async function fetchUpstreamAuthToken({
  client_id,
  client_secret,
  code,
  redirect_uri,
  upstream_url,
}: {
  code: string | undefined;
  upstream_url: string;
  client_secret: string;
  redirect_uri: string;
  client_id: string;
}): Promise<[GoogleOAuthTokenResponse, null] | [null, Response]> {
  if (!code) {
    return [null, new Response("Missing code", { status: 400 })];
  }
  const resp = await fetch(upstream_url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id,
      client_secret,
      code,
      redirect_uri,
      grant_type: "authorization_code",
    }).toString(),
  });
  if (!resp.ok) {
    console.log(await resp.text());
    return [
      null,
      new Response("Failed to fetch access token", { status: 500 }),
    ];
  }
  const body = (await resp.json()) as GoogleOAuthTokenResponse;
  const accessToken = body.access_token;
  if (!accessToken) {
    return [null, new Response("Missing access token", { status: 400 })];
  }
  return [body, null];
}

export type Props = {
  sub: string; // Google's unique user ID
  name: string; // Full name
  email: string; // Email address
  accessToken: string; // Access token for API calls
  refreshToken?: string; // Optional refresh token
  expiresIn?: number; // Optional expiration time in seconds
};
