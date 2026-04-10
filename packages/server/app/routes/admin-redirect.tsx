import { LoaderFunctionArgs, redirect } from "react-router";

export const loader = async ({ context }: LoaderFunctionArgs) => {
    const workerName =
        (context.cloudflare.env as { WORKER_NAME?: string }).WORKER_NAME ||
        "counterscale";

    return redirect(
        `https://dash.cloudflare.com/${context.cloudflare.env.CF_ACCOUNT_ID}/workers/services/view/${workerName}`,
    );
};
