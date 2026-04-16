import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useEffect, useState } from "react";
import { Form, Link, useLoaderData } from "react-router";
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
    getActivationSummary,
    getAppErrorSummary,
    deriveInstallSegments,
    getAsyncOutcomeSummary,
    getAppTelemetryOverview,
    getDailyActiveInstalls,
    getFamilyCoUsage,
    getInstallDetail,
    getInstallUsageSummaries,
    getSessionDepthDistribution,
    getSessionQuality,
    getTelemetryDateRange,
    getToolPerformance,
    getToolFamilyUsage,
    type TelemetryDateRange,
} from "~/telemetry/query";

export const meta: MetaFunction = () => {
    return [
        { title: "Counterscale: App Telemetry" },
        { name: "description", content: "Kaboom app telemetry dashboard" },
    ];
};

export async function loader({ context, request }: LoaderFunctionArgs) {
    await requireAuth(request, context.cloudflare.env);

    const url = new URL(request.url);
    const range = getTelemetryDateRange(Object.fromEntries(url.searchParams.entries()));
    const requestedInstallId = url.searchParams.get("install");
    const { analyticsEngine } = context;

    const [
        overview,
        trend,
        families,
        toolPerformance,
        activation,
        sessionQuality,
        asyncOutcomes,
        appErrors,
    ] = await Promise.all([
        getAppTelemetryOverview(analyticsEngine, range),
        getDailyActiveInstalls(analyticsEngine, range),
        getToolFamilyUsage(analyticsEngine, range),
        getToolPerformance(analyticsEngine, range),
        getActivationSummary(analyticsEngine, range),
        getSessionQuality(analyticsEngine, range),
        getAsyncOutcomeSummary(analyticsEngine, range),
        getAppErrorSummary(analyticsEngine, range),
    ]);
    const [installs, sessionDepth, coUsage] = await Promise.all([
        getInstallUsageSummaries(analyticsEngine, range),
        getSessionDepthDistribution(analyticsEngine, range),
        getFamilyCoUsage(analyticsEngine, range),
    ]);

    const segments = deriveInstallSegments(installs, range);
    const selectedInstallSummary =
        installs.find((install) => install.installId === requestedInstallId) || installs[0] || null;
    const selectedInstall = selectedInstallSummary
        ? await getInstallDetail(
              analyticsEngine,
              range,
              selectedInstallSummary.installId,
              selectedInstallSummary,
          )
        : null;

    return {
        range,
        overview,
        trend,
        families,
        installs,
        segments,
        sessionDepth,
        coUsage,
        toolPerformance,
        activation,
        sessionQuality,
        asyncOutcomes,
        appErrors,
        selectedInstall,
    };
}

function formatNumber(value: number) {
    return Intl.NumberFormat("en", { notation: "compact" }).format(value);
}

function formatPercent(value: number) {
    return `${Math.round(value * 100)}%`;
}

function formatDurationSeconds(value: number) {
    if (value >= 3600) return `${(value / 3600).toFixed(1)}h`;
    if (value >= 60) return `${Math.round(value / 60)}m`;
    return `${Math.round(value)}s`;
}

function buildInstallHref(range: TelemetryDateRange, installId: string) {
    const params = new URLSearchParams();
    params.set("start", range.start);
    params.set("end", range.end);
    if (range.preset) params.set("preset", range.preset);
    params.set("install", installId);
    return `/app?${params.toString()}`;
}

function TimeSeriesAreaChart({
    data,
    dataKey,
    testId,
    emptyMessage,
    stroke,
    fill,
}: {
    data: Array<Record<string, number | string>>;
    dataKey: string;
    testId: string;
    emptyMessage: string;
    stroke: string;
    fill: string;
}) {
    if (data.length === 0) {
        return <div className="text-sm text-muted-foreground">{emptyMessage}</div>;
    }

    return (
        <div className="h-72 min-h-72 w-full min-w-0" data-testid={testId}>
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
                    <Area type="monotone" dataKey={dataKey} stroke={stroke} fill={fill} />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}

function SessionDepthSummary({
    buckets,
}: {
    buckets: Array<{ label: string; sessionCount: number }>;
}) {
    if (buckets.length === 0) {
        return (
            <div className="text-sm text-muted-foreground">
                Session depth becomes more informative once more installs are active.
            </div>
        );
    }

    return (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {buckets.map((bucket) => (
                <Card key={bucket.label} className="shadow-none">
                    <CardHeader className="pb-3">
                        <CardDescription>{bucket.label} tool calls / session</CardDescription>
                        <CardTitle>{formatNumber(bucket.sessionCount)}</CardTitle>
                    </CardHeader>
                </Card>
            ))}
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
                    <div className="kaboom-label mb-2">Kaboom Metrics</div>
                    <h1 className="kaboom-title text-2xl sm:text-4xl">Kaboom Usage</h1>
                    <p className="kaboom-subtitle">
                        How Kaboom is being used over the selected range.
                    </p>
                </div>

                <Form method="get" className="kaboom-filter-bar flex gap-2 flex-wrap items-end">
                    <div className="flex flex-col">
                        <label htmlFor="preset" className="text-sm font-medium">
                            Range
                        </label>
                        <select
                            id="preset"
                            name="preset"
                            defaultValue={data.range.preset || "this_month"}
                            className="h-11 rounded-full border border-input bg-background/85 px-4"
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
                            className="h-11 rounded-full border border-input bg-background/85 px-4"
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
                            className="h-11 rounded-full border border-input bg-background/85 px-4"
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
                    <TimeSeriesAreaChart
                        data={data.trend}
                        dataKey="activeInstalls"
                        testId="daily-active-installs-chart"
                        emptyMessage="No activity in the selected range."
                        stroke="#F46A3D"
                        fill="#F99C35"
                    />
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
                                            selectedFamily === family.family ? "default" : "outline"
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
                                        <div>{formatNumber(selectedSubtool.totalUsage)} total uses</div>
                                        <div>
                                            {formatNumber(selectedSubtool.uniqueInstalls)} installs
                                        </div>
                                    </CardContent>
                                </Card>
                            ) : null}

                            {visibleFamilies.map((family) => (
                                <details key={family.family} className="rounded-md border p-3" open>
                                    <summary className="cursor-pointer list-none flex items-center justify-between gap-4">
                                        <div className="font-medium">{family.family}</div>
                                        <div className="text-sm text-muted-foreground flex gap-4">
                                            <span>{formatNumber(family.totalUsage)} uses</span>
                                            <span>
                                                {formatNumber(family.uniqueInstalls)} installs
                                            </span>
                                        </div>
                                    </summary>
                                    <div className="mt-3">
                                        <Table>
                                            <TableHeader>
                                                <TableRow className="grid-cols-[minmax(0,1fr),minmax(0,8ch),minmax(0,8ch)]">
                                                    <TableHead>Subtool</TableHead>
                                                    <TableHead className="text-right">Uses</TableHead>
                                                    <TableHead className="text-right">
                                                        Installs
                                                    </TableHead>
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

            <div className="grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
                <Card>
                    <CardHeader>
                        <CardTitle>Install Activity</CardTitle>
                        <CardDescription>
                            Top installs by tool volume across the selected range.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {data.installs.length === 0 ? (
                            <div className="text-sm text-muted-foreground">
                                No installs have reported telemetry in the selected range.
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow className="grid-cols-[minmax(0,1.3fr),repeat(5,minmax(0,8ch))]">
                                        <TableHead>Install</TableHead>
                                        <TableHead className="text-right">Events</TableHead>
                                        <TableHead className="text-right">Sessions</TableHead>
                                        <TableHead className="text-right">Days</TableHead>
                                        <TableHead className="text-right">Minutes</TableHead>
                                        <TableHead className="text-right">Top family</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {data.installs.map((install) => (
                                        <TableRow
                                            key={install.installId}
                                            className="grid-cols-[minmax(0,1.3fr),repeat(5,minmax(0,8ch))]"
                                        >
                                            <TableCell>
                                                <Link
                                                    className="font-medium hover:underline"
                                                    to={buildInstallHref(data.range, install.installId)}
                                                >
                                                    {install.installId}
                                                </Link>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {formatNumber(install.totalEvents)}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {formatNumber(install.totalSessions)}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {formatNumber(install.activeDays)}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {formatNumber(install.approxActiveMinutes)}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {install.topFamily}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Behavior Segments</CardTitle>
                        <CardDescription>
                            Lightweight segmentation from current install and session activity.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {data.segments.length === 0 ? (
                            <div className="text-sm text-muted-foreground">
                                Segments will appear once installs start sending telemetry.
                            </div>
                        ) : (
                            data.segments.map((segment) => (
                                <Card key={segment.key} className="shadow-none">
                                    <CardHeader className="pb-3">
                                        <CardDescription>{segment.description}</CardDescription>
                                        <div className="flex items-end justify-between gap-4">
                                            <CardTitle>{segment.label}</CardTitle>
                                            <div className="text-right">
                                                <div className="text-lg font-semibold">
                                                    {formatNumber(segment.count)}
                                                </div>
                                                <div className="text-sm text-muted-foreground">
                                                    {formatPercent(segment.share)}
                                                </div>
                                            </div>
                                        </div>
                                    </CardHeader>
                                </Card>
                            ))
                        )}
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Install Detail</CardTitle>
                    <CardDescription>
                        Per-install behavior for the currently selected install.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {data.selectedInstall ? (
                        <>
                            <div className="grid gap-4 md:grid-cols-4">
                                <Card className="shadow-none">
                                    <CardHeader className="pb-3">
                                        <CardDescription>Install</CardDescription>
                                        <CardTitle className="text-lg">
                                            {data.selectedInstall.installId}
                                        </CardTitle>
                                    </CardHeader>
                                </Card>
                                <Card className="shadow-none">
                                    <CardHeader className="pb-3">
                                        <CardDescription>Active days</CardDescription>
                                        <CardTitle>{formatNumber(data.selectedInstall.activeDays)}</CardTitle>
                                    </CardHeader>
                                </Card>
                                <Card className="shadow-none">
                                    <CardHeader className="pb-3">
                                        <CardDescription>Sessions</CardDescription>
                                        <CardTitle>
                                            {formatNumber(data.selectedInstall.totalSessions)}
                                        </CardTitle>
                                    </CardHeader>
                                </Card>
                                <Card className="shadow-none">
                                    <CardHeader className="pb-3">
                                        <CardDescription>Approx active minutes</CardDescription>
                                        <CardTitle>
                                            {formatNumber(data.selectedInstall.approxActiveMinutes)}
                                        </CardTitle>
                                    </CardHeader>
                                </Card>
                            </div>

                            <div className="grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
                                <Card className="shadow-none">
                                    <CardHeader>
                                        <CardTitle className="text-xl">Install Activity Trend</CardTitle>
                                        <CardDescription>
                                            Daily tool volume for the selected install.
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <TimeSeriesAreaChart
                                            data={data.selectedInstall.activity}
                                            dataKey="totalEvents"
                                            testId="selected-install-chart"
                                            emptyMessage="No tool activity for the selected install."
                                            stroke="#071F26"
                                            fill="#D7E4DD"
                                        />
                                    </CardContent>
                                </Card>

                                <Card className="shadow-none">
                                    <CardHeader>
                                        <CardTitle className="text-xl">Selected Install Session Depth</CardTitle>
                                        <CardDescription>
                                            Approximate tool calls per session for this install.
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <SessionDepthSummary buckets={data.selectedInstall.sessionDepth} />
                                    </CardContent>
                                </Card>
                            </div>

                            <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
                                <Card className="shadow-none">
                                    <CardHeader>
                                        <CardTitle className="text-xl">Top Families</CardTitle>
                                        <CardDescription>
                                            Families used by the selected install over the current range.
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <Table>
                                            <TableHeader>
                                                <TableRow className="grid-cols-[minmax(0,1fr),minmax(0,8ch),minmax(0,8ch)]">
                                                    <TableHead>Family</TableHead>
                                                    <TableHead className="text-right">Uses</TableHead>
                                                    <TableHead className="text-right">Subtools</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {data.selectedInstall.families.map((family) => (
                                                    <TableRow
                                                        key={family.family}
                                                        className="grid-cols-[minmax(0,1fr),minmax(0,8ch),minmax(0,8ch)]"
                                                    >
                                                        <TableCell>{family.family}</TableCell>
                                                        <TableCell className="text-right">
                                                            {formatNumber(family.totalUsage)}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            {formatNumber(family.subtools.length)}
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </CardContent>
                                </Card>

                                <Card className="shadow-none">
                                    <CardHeader>
                                        <CardTitle className="text-xl">Top Subtools</CardTitle>
                                        <CardDescription>
                                            Highest-volume subtools used by this install.
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-2">
                                        {data.selectedInstall.families
                                            .flatMap((family) =>
                                                family.subtools.map((subtool) => ({
                                                    family: family.family,
                                                    ...subtool,
                                                })),
                                            )
                                            .sort((a, b) => b.totalUsage - a.totalUsage)
                                            .slice(0, 8)
                                            .map((subtool) => (
                                                <div
                                                    key={subtool.key}
                                                    className="flex items-center justify-between rounded-2xl border px-4 py-3 text-sm"
                                                >
                                                    <div>
                                                        <div className="font-medium">
                                                            {subtool.family} / {subtool.name}
                                                        </div>
                                                        <div className="text-muted-foreground">
                                                            top subtool activity
                                                        </div>
                                                    </div>
                                                    <div className="text-right font-medium">
                                                        {formatNumber(subtool.totalUsage)}
                                                    </div>
                                                </div>
                                            ))}
                                    </CardContent>
                                </Card>
                            </div>
                        </>
                    ) : (
                        <div className="text-sm text-muted-foreground">
                            Select an install from the table above to inspect its activity.
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Behavior Signals</CardTitle>
                    <CardDescription>
                        Co-usage and session depth across the selected range.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div>
                        <h3 className="text-lg font-semibold">Session Depth</h3>
                        <p className="text-sm text-muted-foreground">
                            This shows how many tool calls land inside each session bucket.
                        </p>
                        <div className="mt-3">
                            <SessionDepthSummary buckets={data.sessionDepth} />
                        </div>
                    </div>

                    <div>
                        <h3 className="text-lg font-semibold">Family Pairings</h3>
                        <p className="text-sm text-muted-foreground">
                            Families used by the same install during the selected range.
                        </p>
                        <div className="mt-3">
                            {data.coUsage.length === 0 ? (
                                <div className="text-sm text-muted-foreground">
                                    Pairings will appear once installs start using multiple tool families.
                                </div>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow className="grid-cols-[minmax(0,1fr),minmax(0,1fr),minmax(0,10ch)]">
                                            <TableHead>Family A</TableHead>
                                            <TableHead>Family B</TableHead>
                                            <TableHead className="text-right">
                                                Shared installs
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {data.coUsage.map((pair) => (
                                            <TableRow
                                                key={`${pair.familyA}:${pair.familyB}`}
                                                className="grid-cols-[minmax(0,1fr),minmax(0,1fr),minmax(0,10ch)]"
                                            >
                                                <TableCell>{pair.familyA}</TableCell>
                                                <TableCell>{pair.familyB}</TableCell>
                                                <TableCell className="text-right">
                                                    {formatNumber(pair.sharedInstalls)}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Performance and Reliability</CardTitle>
                    <CardDescription>
                        v2 telemetry for activation, latency, async outcomes, and app/runtime failures.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid gap-4 md:grid-cols-3">
                        <Card className="shadow-none">
                            <CardHeader className="pb-3">
                                <CardDescription>Activation</CardDescription>
                                <CardTitle>{formatPercent(data.activation.activationRate)}</CardTitle>
                            </CardHeader>
                            <CardContent className="pt-0 text-sm text-muted-foreground">
                                {formatNumber(data.activation.activatedInstallCount)} of{" "}
                                {formatNumber(data.activation.installCount)} installs reached first tool use.
                            </CardContent>
                        </Card>
                        <Card className="shadow-none">
                            <CardHeader className="pb-3">
                                <CardDescription>Session Quality</CardDescription>
                                <CardTitle>{formatDurationSeconds(data.sessionQuality.avgDurationS)}</CardTitle>
                            </CardHeader>
                            <CardContent className="pt-0 text-sm text-muted-foreground">
                                {formatNumber(data.sessionQuality.avgToolCalls)} average tool calls per session.
                            </CardContent>
                        </Card>
                        <Card className="shadow-none">
                            <CardHeader className="pb-3">
                                <CardDescription>Runtime Failures</CardDescription>
                                <CardTitle>
                                    {formatNumber(
                                        data.appErrors.reduce((sum, row) => sum + row.count, 0),
                                    )}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="pt-0 text-sm text-muted-foreground">
                                Product/runtime failures outside normal tool usage.
                            </CardContent>
                        </Card>
                    </div>

                    <div>
                        <h3 className="text-lg font-semibold">Tool Performance</h3>
                        <p className="text-sm text-muted-foreground">
                            Call volume, error rate, and latency by tool from normalized summary rows.
                        </p>
                        <div className="mt-3">
                            {data.toolPerformance.length === 0 ? (
                                <div className="text-sm text-muted-foreground">
                                    Tool performance will appear once v2 usage summaries arrive.
                                </div>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow className="grid-cols-[minmax(0,1.1fr),repeat(5,minmax(0,9ch))]">
                                            <TableHead>Tool</TableHead>
                                            <TableHead className="text-right">Calls</TableHead>
                                            <TableHead className="text-right">Installs</TableHead>
                                            <TableHead className="text-right">Errors</TableHead>
                                            <TableHead className="text-right">Avg ms</TableHead>
                                            <TableHead className="text-right">Max ms</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {data.toolPerformance.map((row) => (
                                            <TableRow
                                                key={row.tool}
                                                className="grid-cols-[minmax(0,1.1fr),repeat(5,minmax(0,9ch))]"
                                            >
                                                <TableCell>{row.tool}</TableCell>
                                                <TableCell className="text-right">
                                                    {formatNumber(row.totalCalls)}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {formatNumber(row.uniqueInstalls)}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {formatPercent(row.errorRate)}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {formatNumber(row.avgLatencyMs)}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {formatNumber(row.maxLatencyMs)}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </div>
                    </div>

                    <div className="grid gap-6 xl:grid-cols-[0.8fr,1.2fr]">
                        <Card className="shadow-none">
                            <CardHeader>
                                <CardTitle className="text-xl">Async Outcomes</CardTitle>
                                <CardDescription>
                                    Completion and failure modes for async commands.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                {data.asyncOutcomes.length === 0 ? (
                                    <div className="text-sm text-muted-foreground">
                                        Async command outcomes will appear once the app emits them.
                                    </div>
                                ) : (
                                    data.asyncOutcomes.map((row) => (
                                        <div
                                            key={row.outcome}
                                            className="flex items-center justify-between rounded-2xl border px-4 py-3 text-sm"
                                        >
                                            <div className="font-medium">{row.outcome}</div>
                                            <div>{formatNumber(row.count)}</div>
                                        </div>
                                    ))
                                )}
                            </CardContent>
                        </Card>

                        <Card className="shadow-none">
                            <CardHeader>
                                <CardTitle className="text-xl">App Errors</CardTitle>
                                <CardDescription>
                                    Runtime failures that are not modeled as failed tool calls.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                {data.appErrors.length === 0 ? (
                                    <div className="text-sm text-muted-foreground">
                                        App/runtime errors will appear once the app emits `app_error`.
                                    </div>
                                ) : (
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="grid-cols-[minmax(0,12ch),minmax(0,1fr),minmax(0,8ch)]">
                                                <TableHead>Kind</TableHead>
                                                <TableHead>Code</TableHead>
                                                <TableHead className="text-right">Count</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {data.appErrors.map((row) => (
                                                <TableRow
                                                    key={`${row.errorKind}:${row.errorCode}`}
                                                    className="grid-cols-[minmax(0,12ch),minmax(0,1fr),minmax(0,8ch)]"
                                                >
                                                    <TableCell>{row.errorKind}</TableCell>
                                                    <TableCell>{row.errorCode}</TableCell>
                                                    <TableCell className="text-right">
                                                        {formatNumber(row.count)}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    <Card className="shadow-none">
                        <CardHeader>
                            <CardTitle className="text-xl">Pending Flow Analysis</CardTitle>
                            <CardDescription>
                                Ordered workflow and sequence analysis will get materially better as
                                `tool_call` volume grows.
                            </CardDescription>
                        </CardHeader>
                    </Card>
                </CardContent>
            </Card>
        </div>
    );
}
