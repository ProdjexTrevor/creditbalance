import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";

type Queue = {
  id: string;
  name: string;
  openCount: number;
  refundReasonId: string;
  refundReason: { code: number; name: string };
};

export function QueuesPage() {
  const { clientId } = useAuth();
  const navigate = useNavigate();
  const [queues, setQueues] = useState<Queue[]>([]);
  const [starting, setStarting] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId) return;
    api.get(`/queues/${clientId}`).then((r) => setQueues(r.data));
  }, [clientId]);

  async function workQueue(q: Queue) {
    if (!clientId) return;
    setStarting(q.id);
    try {
      const r = await api.get("/accounts/queue/next", {
        params: { clientId, reasonId: q.refundReasonId },
      });
      if (r.data.next?.id) {
        navigate(`/accounts/${r.data.next.id}?reasonId=${q.refundReasonId}`);
      } else {
        navigate(`/accounts?reasonId=${q.refundReasonId}`);
      }
    } finally {
      setStarting(null);
    }
  }

  return (
    <>
      <div className="topbar">
        <h1>Work queues</h1>
      </div>
      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>
          Queues are created from hierarchy rules (one per refund reason). Open the
          list or jump straight into the workbench.
        </p>
        <table>
          <thead>
            <tr>
              <th>Queue</th>
              <th>Reason code</th>
              <th>Open accounts</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {queues.map((q) => (
              <tr key={q.id}>
                <td>{q.name}</td>
                <td>
                  <span className="badge">{q.refundReason.code}</span>
                </td>
                <td className="mono">{q.openCount}</td>
                <td>
                  <div className="btn-row">
                    <Link className="btn" to={`/accounts?reasonId=${q.refundReasonId}`}>
                      List
                    </Link>
                    <button
                      type="button"
                      className="btn primary"
                      disabled={q.openCount === 0 || starting === q.id}
                      onClick={() => workQueue(q)}
                    >
                      {starting === q.id ? "…" : "Work"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {queues.length === 0 && (
          <div className="empty">No queues for this client.</div>
        )}
      </div>
    </>
  );
}
