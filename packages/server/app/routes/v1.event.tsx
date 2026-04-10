import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { ingestAppTelemetryRequest } from "~/telemetry/ingest";

export async function loader(_args: LoaderFunctionArgs) {
    return new Response("Method Not Allowed", {
        status: 405,
        headers: {
            Allow: "POST",
        },
    });
}

export async function action({ request, context }: ActionFunctionArgs) {
    return ingestAppTelemetryRequest(
        request,
        (context.cloudflare.env as Env).APP_TELEMETRY_AE,
    );
}
