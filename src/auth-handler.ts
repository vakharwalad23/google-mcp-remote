import type {
  AuthRequest,
  OAuthHelpers,
} from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";
import { env } from "cloudflare:workers";
import {
  fetchUpstreamAuthToken,
  getUpstreamAuthorizeUrl,
  Props,
} from "./utils/upstream-utils";
import {
  clientIdAlreadyApproved,
  parseRedirectApproval,
  renderApprovalDialog,
} from "./utils/workers-oauth-utils";

interface GoogleUserInfo {
  sub: string; // Google's unique identifier for the user
  name: string; // User's full name
  email: string; // User's email address
  picture?: string; // User's profile picture URL
  given_name?: string; // User's first name
  family_name?: string; // User's last name
  locale?: string; // User's locale
  verified_email?: boolean; // Whether the email is verified
}

const app = new Hono<{ Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }>();

async function redirectToGoogle(
  request: Request,
  oauthReqInfo: AuthRequest,
  headers: Record<string, string> = {}
) {
  const scopes = [
    "profile", // Basic profile info
    "email", // User email address
    "https://www.googleapis.com/auth/gmail.modify", // Modify Gmail data
    "https://www.googleapis.com/auth/gmail.readonly", // Read Gmail data
    "https://www.googleapis.com/auth/drive", // Access Google Drive
    "https://www.googleapis.com/auth/calendar", // Access Google Calendar
    "https://www.googleapis.com/auth/tasks", // Access Google Tasks
  ].join(" ");
  return new Response(null, {
    status: 302,
    headers: {
      ...headers,
      location: getUpstreamAuthorizeUrl({
        upstream_url: "https://accounts.google.com/o/oauth2/v2/auth",
        scope: scopes,
        client_id: env.GOOGLE_OAUTH_CLIENT_ID,
        redirect_uri: new URL("/callback", request.url).href,
        state: btoa(JSON.stringify(oauthReqInfo)),
      }),
    },
  });
}

app.get("/authorize", async (c) => {
  const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
  const { clientId } = oauthReqInfo;
  if (!clientId) {
    return c.text("Invalid request", 400);
  }
  if (
    await clientIdAlreadyApproved(
      c.req.raw,
      oauthReqInfo.clientId,
      c.env.COOKIE_ENCRYPTION_KEY
    )
  ) {
    return redirectToGoogle(c.req.raw, oauthReqInfo);
  }
  return renderApprovalDialog(c.req.raw, {
    client: await c.env.OAUTH_PROVIDER.lookupClient(clientId),
    server: {
      name: "Cloudflare Google MCP Server",
      logo: "https://www.google.com/images/branding/googlelogo/1x/googlelogo_color_272x92dp.png",
      description:
        "This is a demo MCP Remote Server using Google for authentication.",
    },
    state: { oauthReqInfo },
  });
});

app.post("/authorize", async (c) => {
  // Validates form submission, extracts state, and generates Set-Cookie headers to skip approval dialog next time
  const { state, headers } = await parseRedirectApproval(
    c.req.raw,
    env.COOKIE_ENCRYPTION_KEY
  );
  if (!state.oauthReqInfo) {
    return c.text("Invalid request", 400);
  }

  return redirectToGoogle(c.req.raw, state.oauthReqInfo, headers);
});

app.get("/callback", async (c) => {
  const state = c.req.query("state");
  if (!state) {
    return c.text("Missing state", 400);
  }
  const oauthReqInfo = JSON.parse(atob(state)) as AuthRequest;
  if (!oauthReqInfo.clientId) {
    return c.text("Invalid state", 400);
  }
  const code = c.req.query("code");
  if (!code) {
    return c.text("Missing code", 400);
  }
  const [accessToken, errResponse] = await fetchUpstreamAuthToken({
    upstream_url: "https://oauth2.googleapis.com/token",
    client_id: c.env.GOOGLE_OAUTH_CLIENT_ID,
    client_secret: c.env.GOOGLE_OAUTH_CLIENT_SECRET,
    code,
    redirect_uri: new URL("/callback", c.req.url).href,
  });
  if (errResponse) return errResponse;

  const userResponse = await fetch(
    "https://www.googleapis.com/oauth2/v3/userinfo",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );
  if (!userResponse.ok) {
    return new Response("Failed to fetch user info", { status: 500 });
  }
  const user = (await userResponse.json()) as GoogleUserInfo;
  const { sub, name, email } = user;

  const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
    request: oauthReqInfo,
    userId: sub,
    metadata: {
      label: name,
    },
    scope: oauthReqInfo.scope,
    props: {
      sub,
      name,
      email,
      accessToken,
    } as Props,
  });
  return Response.redirect(redirectTo);
});

export { app as GoogleHandler };
