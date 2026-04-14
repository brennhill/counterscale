import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useEffect, useState } from "react";
import { Form, useLoaderData } from "react-router";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "~/components/ui/table";
import { requireAuth } from "~/lib/auth";
import {
    getAppTelemetryOverview,
    getDailyActiveInstalls,
    getTelemetryDateRange,
    getToolFamilyUsage,
} from "~/telemetry/query";

export const meta: MetaFunction = () => {
    return [
        { title: "Counterscale: App Telemetry" },
        { name: "description", content: "Kaboom app telemetry dashboard" },
    ];
};

export async function loader({ context, request }: LoaderFunctionArgs) {
    await requireAuth(request, context.cloudflare.env);

    const range = getTelemetryDateRange(
        Object.fromEntries(new URL(request.url).searchParams.entries()),
    );

    const { analyticsEngine } = context;
    const [overview, trend, families] = await Promise.all([
        getAppTelemetryOverview(analyticsEngine, range),
        getDailyActiveInstalls(analyticsEngine, range),
        getToolFamilyUsage(analyticsEngine, range),
    ]);

    return {
        range,
        overview,
        trend,
        families,
    };
}

function formatNumber(value: number) {
    return Intl.NumberFormat("en", { notation: "compact" }).format(value);
}

function DailyActiveInstallsChart({
    data,
}: {
    data: Array<{ date: string; activeInstalls: number }>;
}) {
    if (data.length === 0) {
        return (
            <div className="text-sm text-muted-foreground">
                No activity in the selected range.
            </div>
        );
    }

    return (
        <div className="h-72 min-h-72 w-full min-w-0" data-testid="daily-active-installs-chart">
            <ResponsiveContainer width="100%" height="100%" minWidth={320} minHeight={288}>
                <AreaChart data={data} margin={{ top: 12, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                        dataKey="date"
                        tickFormatter={(value) =>
                            new Date(`${value}T00:00:00Z`).toLocaleDateString("en-us", {
                                month: "short",
                                day: "numeric",
                            })
                        }
                    />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Area
                        type="monotone"
                        dataKey="activeInstalls"
                        stroke="#F46A3D"
                        fill="#F99C35"
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}

export default function AppDashboard() {
    const data = useLoaderData<typeof loader>();
    const [selectedFamily, setSelectedFamily] = useState<string | null>(null);
    const [selectedSubtoolKey, setSelectedSubtoolKey] = useState<string | null>(null);

    const visibleFamilies = selectedFamily
        ? data.families.filter((family) => family.family === selectedFamily)
        : data.families;
    const selectedSubtool =
        visibleFamilies
            .flatMap((family) =>
                family.subtools.map((subtool) => ({
                    family: family.family,
                    ...subtool,
                })),
            )
            .find((subtool) => subtool.key === selectedSubtoolKey) || null;

    useEffect(() => {
        if (
            selectedSubtoolKey &&
            !visibleFamilies.some((family) =>
                family.subtools.some((subtool) => subtool.key === selectedSubtoolKey),
            )
        ) {
            setSelectedSubtoolKey(null);
        }
    }, [selectedSubtoolKey, visibleFamilies]);

    return (
        <div className="space-y-6">
            <div className="flex items-end justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-2xl font-semibold">App Telemetry</h1>
                    <p className="text-sm text-muted-foreground">
                        Kaboom install and tool usage over the selected range.
                    </p>
                </div>

                <Form method="get" className="flex gap-2 flex-wrap items-end">
                    <div className="flex flex-col">
                        <label htmlFor="preset" className="text-sm font-medium">
                            Range
                        </label>
                        <select
                            id="preset"
                            name="preset"
                            defaultValue={data.range.preset || "this_month"}
                            className="border rounded-md h-10 px-3 bg-background"
                        >
                            <option value="7d">7 days</option>
                            <option value="30d">30 days</option>
                            <option value="this_month">This month</option>
                            <option value="custom">Custom</option>
                        </select>
                    </div>

                    <div className="flex flex-col">
                        <label htmlFor="start" className="text-sm font-medium">
                            Start
                        </label>
                        <input
                            id="start"
                            name="start"
                            type="date"
                            defaultValue={data.range.start}
                            className="border rounded-md h-10 px-3 bg-background"
                        />
                    </div>

                    <div className="flex flex-col">
                        <label htmlFor="end" className="text-sm font-medium">
                            End
                        </label>
                        <input
                            id="end"
                            name="end"
                            type="date"
                            defaultValue={data.range.end}
                            className="border rounded-md h-10 px-3 bg-background"
                        />
                    </div>

                    <Button type="submit">Apply</Button>
                </Form>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader>
                        <CardDescription>Unique Installs</CardDescription>
                        <CardTitle>{formatNumber(data.overview.uniqueInstalls)}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader>
                        <CardDescription>Total Tool Events</CardDescription>
                        <CardTitle>{formatNumber(data.overview.totalEvents)}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader>
                        <CardDescription>Total Sessions</CardDescription>
                        <CardTitle>{formatNumber(data.overview.totalSessions)}</CardTitle>
                    </CardHeader>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Daily Active Installs</CardTitle>
                    <CardDescription>
                        Distinct install IDs with app activity in the selected range.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <DailyActiveInstallsChart data={data.trend} />
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Tool Usage</CardTitle>
                    <CardDescription>
                        Usage totals and unique installs by family and subtool.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    {data.families.length === 0 ? (
                        <div className="text-sm text-muted-foreground">
                            No tool activity in the selected range.
                        </div>
                    ) : (
                        <>
                            <div className="flex flex-wrap gap-2">
                                <Button
                                    type="button"
                                    variant={selectedFamily === null ? "default" : "outline"}
                                    onClick={() => setSelectedFamily(null)}
                                >
                                    All families
                                </Button>
                                {data.families.map((family) => (
                                    <Button
                                        key={family.family}
                                        type="button"
                                        variant={
                                            selectedFamily === family.family
                                                ? "default"
                                                : "outline"
                                        }
                                        onClick={() => setSelectedFamily(family.family)}
                                    >
                                        {family.family}
                                    </Button>
                                ))}
                            </div>

                            {selectedSubtool ? (
                                <Card>
                                    <CardHeader>
                                        <CardDescription>Selected Subtool</CardDescription>
                                        <CardTitle>
                                            {selectedSubtool.family} / {selectedSubtool.name}
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                                        <div>
                                            {formatNumber(selectedSubtool.totalUsage)} total uses
                                        </div>
                                        <div>
                                            {formatNumber(selectedSubtool.uniqueInstalls)} installs
                                        </div>
                                    </CardContent>
                                </Card>
                            ) : null}

                            {visibleFamilies.map((family) => (
                            <details
                                key={family.family}
                                className="rounded-md border p-3"
                                open
                            >
                                <summary className="cursor-pointer list-none flex items-center justify-between gap-4">
                                    <div className="font-medium">{family.family}</div>
                                    <div className="text-sm text-muted-foreground flex gap-4">
                                        <span>{formatNumber(family.totalUsage)} uses</span>
                                        <span>{formatNumber(family.uniqueInstalls)} installs</span>
                                    </div>
                                </summary>
                                <div className="mt-3">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="grid-cols-[minmax(0,1fr),minmax(0,8ch),minmax(0,8ch)]">
                                                <TableHead>Subtool</TableHead>
                                                <TableHead className="text-right">Uses</TableHead>
                                                <TableHead className="text-right">Installs</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {family.subtools.map((subtool) => (
                                                <TableRow
                                                    key={subtool.key}
                                                    className="grid-cols-[minmax(0,1fr),minmax(0,8ch),minmax(0,8ch)]"
                                                >
                                                    <TableCell>
                                                        <button
                                                            type="button"
                                                            className={`text-left hover:underline ${
                                                                selectedSubtoolKey ===
                                                                subtool.key
                                                                    ? "font-semibold"
                                                                    : ""
                                                            }`}
                                                            aria-label={`${subtool.name} ${formatNumber(subtool.totalUsage)} uses ${formatNumber(subtool.uniqueInstalls)} installs`}
                                                            onClick={() =>
                                                                setSelectedSubtoolKey(
                                                                    subtool.key,
                                                                )
                                                            }
                                                        >
                                                            {subtool.name}
                                                        </button>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        {formatNumber(subtool.totalUsage)}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        {formatNumber(subtool.uniqueInstalls)}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </details>
                            ))}
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
