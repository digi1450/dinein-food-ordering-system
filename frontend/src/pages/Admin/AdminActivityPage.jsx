// frontend/src/pages/Admin/AdminActivityPage.jsx
import { useEffect, useState } from "react";
import API_BASE from "../../lib/apiBase";

const PAGE_SIZE = 50;

function formatDateTime(s) {
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString();
}

export default function AdminActivityPage() {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  // filters
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [q, setQ] = useState("");
  const [entityType, setEntityType] = useState("");
  const [action, setAction] = useState("");
  const [dateRange, setDateRange] = useState("7d"); // 1d,7d,30d,all
  const [refreshTick, setRefreshTick] = useState(0);
  const [liveTick, setLiveTick] = useState(0);

  const token = sessionStorage.getItem("token") || "";

  function buildDateRangeParams() {
    if (dateRange === "all") return {};
    const now = new Date();
    const from = new Date(now);
    if (dateRange === "1d") from.setDate(now.getDate() - 1);
    else if (dateRange === "7d") from.setDate(now.getDate() - 7);
    else if (dateRange === "30d") from.setDate(now.getDate() - 30);

    const pad = (n) => String(n).padStart(2, "0");
    const dateFrom = `${from.getFullYear()}-${pad(from.getMonth() + 1)}-${pad(from.getDate())}`;
    const dateTo = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    return { date_from: dateFrom, date_to: dateTo };
  }

  // Helper to fetch activity, optionally showing spinner
  const fetchActivity = async ({ signal, showSpinner } = {}) => {
    if (showSpinner) {
      setLoading(true);
    }
    setErr(null);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(PAGE_SIZE));
      if (q.trim()) params.set("q", q.trim());
      if (entityType) params.set("entity_type", entityType);
      if (action) params.set("action", action);

      const { date_from, date_to } = buildDateRangeParams();
      if (date_from) params.set("date_from", date_from);
      if (date_to) params.set("date_to", date_to);

      const resp = await fetch(`${API_BASE}/admin/activity?` + params.toString(), {
        headers: {
          Authorization: token ? `Bearer ${token}` : "",
        },
        signal,
      });
      if (!resp.ok) throw new Error("Failed to load activity.");
      const data = await resp.json();
      setActivities(data.list || []);
      setTotalPages(data.totalPages || 0);
    } catch (e) {
      if (e.name === "AbortError") return;
      setErr(e.message || "Error");
    } finally {
      if (showSpinner) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchActivity({ signal: controller.signal, showSpinner: true });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, q, entityType, action, dateRange, refreshTick]);

  useEffect(() => {
    if (!liveTick) return;
    // For live updates we refetch in the background without showing the Loading... row
    fetchActivity({ showSpinner: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveTick]);

  useEffect(() => {
    // Open SSE for live admin activity
    let es;
    // Handler must be accessible for cleanup
    const bumpLive = () => {
      setLiveTick((t) => t + 1);
    };
    try {
      const token = sessionStorage.getItem("token") || "";
      const url = token
        ? `${API_BASE}/admin/activity/stream?token=${encodeURIComponent(token)}`
        : `${API_BASE}/admin/activity/stream`;

      es = new EventSource(url);

      // Single handler to bump a live tick whenever any activity-related SSE event arrives
      // Listen for a named "activity" event (if backend uses `event: activity`)
      es.addEventListener("activity", bumpLive);

      // Also listen to default `message` events (if backend omits the `event:` field)
      es.onmessage = () => {
        bumpLive();
      };

      es.onerror = () => {
        // Normal for EventSource to emit "error" when the connection is idle or server restarts.
        // Browser will automatically attempt to reconnect, so we keep this quiet unless it fully closes.
        if (es.readyState === EventSource.CLOSED) {
          console.log("[AdminActivity] SSE connection closed. Browser will attempt to reconnect.");
        }
        // Do NOT call es.close() here, so auto-reconnect keeps working.
      };
    } catch (e) {
      console.error("[AdminActivity] Failed to init SSE:", e);
    }

    return () => {
      if (es) {
        try {
          es.removeEventListener("activity", bumpLive);
        } catch (_) {
          // ignore
        }
        es.close();
      }
    };
  }, []);

  const handleRefresh = () => {
    setPage(1);
    setRefreshTick((t) => t + 1);
  };

  return (
    <div className="bg-slate-50 rounded-lg">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold text-slate-900">Admin Activity</h1>
          <button
            onClick={handleRefresh}
            className="px-3 py-1.5 rounded-md border border-slate-300 bg-white text-sm text-slate-800 hover:bg-slate-50"
          >
            Refresh
          </button>
        </div>

        {/* Filters */}
        <div className="mb-4 flex flex-wrap gap-2 items-center">
          <input
            value={q}
            onChange={(e) => {
              setPage(1);
              setQ(e.target.value);
            }}
            placeholder="Search details..."
            className="px-3 py-1.5 text-sm border border-slate-300 rounded-md bg-white text-slate-900 placeholder:text-slate-400 min-w-[220px]"
          />
          <select
            value={entityType}
            onChange={(e) => {
              setPage(1);
              setEntityType(e.target.value);
            }}
            className="px-2 py-1.5 text-sm border border-slate-300 rounded-md bg-white text-slate-900"
          >
            <option value="">All entities</option>
            <option value="food">Food</option>
            {/*<option value="category">Category</option>*/}
            <option value="order">Order</option>
            <option value="order_item">Order Item</option>
            {/*<option value="table">Table</option>*/}
            <option value="bill">Bill</option>
            <option value="login">Login</option>
          </select>
          <select
            value={action}
            onChange={(e) => {
              setPage(1);
              setAction(e.target.value);
            }}
            className="px-2 py-1.5 text-sm border border-slate-300 rounded-md bg-white text-slate-900"
          >
            <option value="">All actions</option>
            <option value="create">Create</option>
            <option value="update">Update</option>
            <option value="delete">Delete</option>
            {/*<option value="soft_delete">Soft delete</option>*/}
            <option value="status_change">Status change</option>
            <option value="login">Login</option>
          </select>
          <select
            value={dateRange}
            onChange={(e) => {
              setPage(1);
              setDateRange(e.target.value);
            }}
            className="px-2 py-1.5 text-sm border border-slate-300 rounded-md bg-white text-slate-900"
          >
            <option value="1d">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="all">All time</option>
          </select>
        </div>

        {err && (
          <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {err}
          </div>
        )}

        <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-slate-600">Time</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600 w-24">Admin</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600 w-48">Entity</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600 w-32">Action</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600">Details</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-3 py-4 text-center text-slate-500" colSpan={5}>
                    Loading...
                  </td>
                </tr>
              ) : activities.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-center text-slate-500" colSpan={5}>
                    No activity found.
                  </td>
                </tr>
              ) : (
                activities.map((a) => (
                  <tr key={a.activity_id} className="border-t border-slate-200 hover:bg-slate-50">
                    <td className="px-3 py-2 align-top text-slate-700">
                      {formatDateTime(a.created_at)}
                    </td>
                    <td className="px-3 py-2 align-top text-slate-700">
                      {a.username || `#${a.user_id || "-"}`}
                    </td>
                    <td className="px-3 py-2 align-top text-slate-700">
                      <div className="font-medium">{a.entity_type}</div>
                      {a.entity_id != null && (
                        <div className="text-xs text-slate-500">ID: {a.entity_id}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top text-slate-700">
                      <span
                        className={
                          "inline-flex items-center px-2 py-0.5 rounded-full text-xs border " +
                          (a.action === "create"
                            ? "bg-green-100 text-green-700 border-green-200"
                            : a.action === "update"
                            ? "bg-blue-100 text-blue-700 border-blue-200"
                            : a.action === "delete"
                            ? "bg-red-100 text-red-700 border-red-200"
                            : a.action === "status_change"
                            ? "bg-amber-100 text-amber-700 border-amber-200"
                            : "bg-slate-100 text-slate-700 border-slate-300")
                        }
                      >
                        {a.action}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-top text-slate-700">
                      <pre className="text-xs whitespace-pre-wrap break-words bg-slate-50 rounded-md px-2 py-1 max-h-32 overflow-auto">
                        {typeof a.details === "string"
                          ? a.details
                          : JSON.stringify(a.details, null, 2)}
                      </pre>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="mt-3 flex items-center justify-between text-xs text-slate-600">
          <div>
            Page {totalPages === 0 ? 0 : page} / {totalPages}
          </div>
          <div className="flex gap-1">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-2 py-1 border border-slate-300 rounded-md bg-white disabled:opacity-40"
            >
              Prev
            </button>
            <button
              disabled={totalPages === 0 || page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-2 py-1 border border-slate-300 rounded-md bg-white disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}