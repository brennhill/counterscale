/// <reference types="vite/client" />
import styles from "./globals.css?url";
import { LoaderFunctionArgs, type LinksFunction } from "react-router";

import {
    Links,
    Meta,
    Outlet,
    Scripts,
    ScrollRestoration,
    useLoaderData,
} from "react-router";
import { getUser, isAuthEnabled } from "~/lib/auth";

export const links: LinksFunction = () => [{ rel: "stylesheet", href: styles }];

/**
 * Generate GitHub information based on the version format
 * @param version - Version string (semver or git SHA)
 * @returns Object with GitHub URL and display version
 */
function getVersionMeta(version: string | null | undefined): {
    url: string | null;
    name: string | null;
} {
    if (!version) return { url: null, name: null };

    // Check if it's a semver (e.g., 1.2.3) or a git SHA
    const isSemver = /^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/.test(version);

    if (isSemver) {
        // Link to release page for semver
        return {
            url: `https://github.com/benvinegar/counterscale/releases/tag/v${version}`,
            name: version,
        };
    } else {
        // Link to commit for git SHA - show only first 7 characters
        return {
            url: `https://github.com/benvinegar/counterscale/commit/${version}`,
            name: version.slice(0, 7),
        };
    }
}

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
    // specified during deploy via wrangler --var VERSION:value
    const version = context.cloudflare?.env?.VERSION;
    const user = await getUser(request, context.cloudflare.env);

    return {
        version: {
            ...getVersionMeta(version),
        },
        origin: new URL(request.url).origin,
        url: request.url,
        user,
        isAuthEnabled: isAuthEnabled(context.cloudflare.env),
    };
};

export const Layout = ({ children = [] }: { children: React.ReactNode }) => {
    const data = useLoaderData<typeof loader>() ?? {
        version: {
            url: "https://example.com/",
            name: "0.0.1",
        },
        origin: "counterscale.dev",
        url: "https://counterscale.dev/",
    };

    return (
        <html lang="en">
            <head>
                <meta charSet="utf-8" />
                <meta
                    name="viewport"
                    content="width=device-width, initial-scale=1"
                />
                <link rel="icon" type="image/x-icon" href="/favicon.png" />
                <meta name="robots" content="noindex" />
                
                <meta property="og:url" content={data.url} />
                <meta property="og:type" content="website" />
                <meta property="og:title" content="Counterscale" />
                <meta
                    property="og:description"
                    content="Scalable web analytics you run yourself on Cloudflare"
                />
                <meta
                    property="og:image"
                    content={data.origin + "/counterscale-og-large.webp"}
                />

                <meta name="twitter:card" content="summary_large_image" />
                <meta property="twitter:domain" content="counterscale.dev" />
                <meta property="twitter:url" content={data.url} />
                <meta name="twitter:title" content="Counterscale" />
                <meta
                    name="twitter:description"
                    content="Scalable web analytics you run yourself on Cloudflare"
                />
                <meta
                    name="twitter:image"
                    content={data.origin + "/counterscale-og-large.webp"}
                />
                <Meta />
                <Links />
            </head>
            <body>
                <div className="kaboom-shell">
                    {children}
                </div>
                <ScrollRestoration />
                <Scripts />
                <script
                    id="counterscale-script"
                    data-site-id="counterscale-dev"
                    src="/tracker.js"
                ></script>
            </body>
        </html>
    );
};

export default function App() {
    const data = useLoaderData<typeof loader>();

    // Check if current domain is a subdomain of counterscale.dev
    const currentOrigin = new URL(data.url).hostname;
    const isCounterscaleSubdomain = currentOrigin.endsWith(".counterscale.dev");
    const homeUrl = isCounterscaleSubdomain ? "https://counterscale.dev" : "/";

    return (
        <div className="kaboom-page">
            <header className="kaboom-nav">
                <div className="kaboom-brand">
                    <a href={homeUrl} className="kaboom-brand-badge" aria-label="Kaboom home">
                        <span className="text-xl">K</span>
                    </a>
                    <div>
                        <div className="kaboom-label">Private Telemetry</div>
                        <a href={homeUrl} className="text-xl font-semibold">
                            Kaboom Metrics
                        </a>
                    </div>
                </div>
                <nav className="flex flex-wrap items-center gap-2 text-sm font-medium sm:text-base">
                    <a href="/dashboard" className="rounded-full px-3 py-2 hover:bg-accent">
                        Web
                    </a>
                    <a href="/app" className="rounded-full px-3 py-2 hover:bg-accent">
                            App
                    </a>
                    <a
                        href="/admin-redirect"
                        target="_blank"
                        className="hidden rounded-full px-3 py-2 hover:bg-accent sm:inline-block"
                    >
                        Admin
                    </a>
                    {(data.user?.authenticated && data.isAuthEnabled) && (
                        <a href="/logout" className="rounded-full px-3 py-2 hover:bg-accent">
                            Logout
                        </a>
                    )}
                    <a
                        href="https://github.com/brennhill/kaboom-metrics"
                        className="rounded-full px-3 py-2 hover:bg-accent"
                    >
                        GitHub
                    </a>
                </nav>
            </header>
            <main role="main" className="w-full">
                <Outlet />
            </main>

            <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border/80 py-4 text-sm text-muted-foreground">
                <div className="kaboom-label">Kaboom telemetry workspace</div>
                <div>
                    Version{" "}
                    {data.version ? (
                        <a
                            href={data.version.url as string}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline"
                        >
                            {data.version.name}
                        </a>
                    ) : (
                        "unknown"
                    )}
                </div>
            </footer>
        </div>
    );
}
