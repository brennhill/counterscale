import { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction, Form, useActionData, useLoaderData, useNavigation, redirect } from "react-router";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { getUser, login, isAuthEnabled } from "~/lib/auth";

export const meta: MetaFunction = () => {
    return [
        { title: "Counterscale: Web Analytics" },
        { name: "description", content: "Counterscale: Web Analytics" },
    ];
};

export async function loader({ request, context }: LoaderFunctionArgs) {
    const env = context.cloudflare.env;
    const user = await getUser(request, env);
    const authEnabled = isAuthEnabled(env);
    
    // Return auth status to conditionally render the login form
    return { user, authEnabled };
}

export async function action({ request, context }: ActionFunctionArgs) {
    const env = context.cloudflare.env;
    
    // If auth is disabled, this action shouldn't be called, but handle it gracefully
    if (!isAuthEnabled(env)) {
        return redirect("/dashboard");
    }
    
    const formData = await request.formData();
    const password = formData.get("password");

    if (typeof password !== "string" || !password) {
        return { error: "Password is required" };
    }

    try {
        return await login(request, password, env);
    } catch {
        return { error: "Invalid password" };
    }
}

export default function Index() {
    const { user, authEnabled } = useLoaderData<typeof loader>();
    const actionData = useActionData<typeof action>();
    const navigation = useNavigation();
    const isSubmitting = ["submitting", "loading"].includes(navigation.state);

    return (
        <div className="grid min-h-[72vh] items-center gap-8 py-6 lg:grid-cols-[minmax(0,1.1fr),minmax(0,0.9fr)]">
            <div className="space-y-5">
                <div className="kaboom-label">Private Analytics</div>
                <h1 className="kaboom-title max-w-[10ch]">
                    Kaboom Metrics
                </h1>
                <p className="kaboom-subtitle">
                    Private analytics and telemetry for Kaboom.
                </p>
                <div className="rounded-[28px] border bg-card/70 p-5 text-sm leading-6 text-muted-foreground shadow-[0_16px_40px_rgba(5,26,30,0.05)]">
                    Use this workspace to inspect website traffic and application telemetry without leaving the Kaboom brand surface.
                </div>
            </div>
            <Card className="w-full max-w-xl p-8 sm:p-10">
                <div className="mb-8 space-y-3">
                    <div className="kaboom-label">Access</div>
                    <h2 className="text-3xl font-semibold">
                        {!authEnabled
                            ? "Dashboard access"
                            : user?.authenticated
                                ? "You are signed in"
                                : "Sign in to continue"}
                    </h2>
                    <p className="text-sm leading-6 text-muted-foreground">
                        {!authEnabled
                            ? "Access the analytics workspace."
                            : user?.authenticated
                                ? "You are signed in. Continue to the analytics workspace."
                                : "Use the shared dashboard password to open the metrics workspace."}
                    </p>
                </div>

                {(!authEnabled || user?.authenticated) ? (
                    <Button asChild className="w-full">
                        <a href="/dashboard">Go to Dashboard</a>
                    </Button>
                ) : (
                    /* When auth is enabled and user is not authenticated, show login form */
                    <Form method="post" className="space-y-4">
                        <div>
                            <label htmlFor="password" className="sr-only">
                                Password
                            </label>
                            <input
                                type="password"
                                id="password"
                                name="password"
                                required
                                disabled={isSubmitting}
                                className="w-full rounded-full border border-input bg-background/80 px-4 py-3 shadow-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                placeholder="Enter your password"
                            />
                        </div>
                        {actionData?.error && (
                            <div className="text-red-600 text-sm">{actionData.error}</div>
                        )}
                        <Button type="submit" className="w-full" disabled={isSubmitting}>
                            {isSubmitting ? "Signing In..." : "Sign In"}
                        </Button>
                    </Form>
                )}
            </Card>
        </div>
    );
}
