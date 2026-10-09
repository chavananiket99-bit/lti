ximport { useEffect, useState } from "react";
import { questionnaireApi, workflowApi } from "../services/endpoints";
import { ROLES } from "../constants/roles";
import { ErrorText } from "./ui.jsx";

const ROLE_LABELS = {
  [ROLES.HO_ACCOUNTS]: "HO Accounts",
  [ROLES.FPA]: "FP&A",
  [ROLES.SECRETARIAL]: "Secretarial",
};

const roleLabel = (roleCode) => ROLE_LABELS[roleCode] || roleCode || "Unknown";

export function RequestViewContent({ proposal, enabled = true }) {
  const [answers, setAnswers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled || !proposal) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setAnswers([]);

    Promise.all([
      questionnaireApi.answersForProposal(proposal.id),
      workflowApi.definition(),
    ])
      .then(([resAnswers, resWorkflow]) => {
        if (cancelled) return;
        const rows = resAnswers.data.results || resAnswers.data || [];
        const normalized = rows.map((r) => ({
          id: r.id,
          question_id: r.question,
          text: r.question_text || (r.question || {}).text,
          state: r.question_state || (r.question || {}).state,
          state_display: r.question_state_display || (r.question || {}).state_display,
          role: r.question_role || (r.question || {}).role_code,
          answered_by_role: r.answered_by_role || (r.answered_by || {}).role_code,
          answer_text: r.answer_text,
          answered_by_name: r.answered_by_name || (r.answered_by || {}).full_name,
          answered_at: r.created_at,
        }));

        const wfStates = (resWorkflow.data && resWorkflow.data.states) || [];
        const orderedCodes = wfStates.map((s) => s.code);
        const stateLabelMap = Object.fromEntries(wfStates.map((s) => [s.code, s.label]));

        const wfDef = (resWorkflow.data && resWorkflow.data.workflow) || {};
        const roleToState = {};
        orderedCodes.forEach((code) => {
          const cfg = wfDef[code] || {};
          (cfg.owners || []).forEach((r) => {
            if (!roleToState[r]) roleToState[r] = code;
          });
        });

        const currentIdx = orderedCodes.indexOf(proposal.current_state);

        const resolved = normalized.map((a) => {
          const departmentRole = a.answered_by_role || a.role;
          const resolvedState = roleToState[departmentRole] || roleToState[a.role] || a.state;
          const baseLabel = stateLabelMap[resolvedState] || resolvedState;
          let subStageLabel = baseLabel;
          if (resolvedState === "DEPT_REVIEW") {
            subStageLabel = roleLabel(departmentRole);
          }
          return {
            ...a,
            state: resolvedState,
            state_display: baseLabel,
            sub_stage: subStageLabel,
          };
        });

        const filtered = resolved.filter((a) => {
          const idx = orderedCodes.indexOf(a.state);
          return idx === -1 ? true : (currentIdx === -1 ? true : idx <= currentIdx);
        });

        setAnswers(filtered);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, proposal]);

  return (
    <div>
      <ErrorText error={error} />

      {loading ? (
        <div className="detail-loading">
          <div className="loading-spinner" />
          <span>Loading request view...</span>
        </div>
      ) : (
        <div>
          <h4 style={{ marginTop: 0 }}>Inputs / Questionnaire</h4>
          <div className="table-wrapper">
            {(() => {
              const byStage = {};
              answers.forEach((a) => {
                const stageKey = a.state_display || a.state || "Unknown";
                const subKey = a.sub_stage || stageKey;
                const key = `${stageKey}::${subKey}`;
                byStage[key] = byStage[key] || { stage: stageKey, sub: subKey, rows: [] };
                byStage[key].rows.push(a);
              });

              const keys = Object.keys(byStage);
              if (keys.length === 0) {
                return (
                  <div style={{ padding: "0.6rem", textAlign: "center", color: "#94a3b8" }}>
                    No inputs found for this proposal.
                  </div>
                );
              }

              return keys.map((k) => {
                const group = byStage[k];
                const title = group.stage === group.sub ? group.stage : `${group.stage} — ${group.sub}`;
                return (
                  <div key={k} style={{ marginBottom: "0.75rem" }}>
                    <div style={{ fontWeight: 700, marginBottom: "0.35rem" }}>{title}</div>
                    <table className="table">
                      <thead>
                        <tr>
                          <th style={{ width: "60%" }}>Question</th>
                          <th style={{ width: "20%" }}>Answer</th>
                          <th style={{ width: "20%" }}>Answered By</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.rows.map((q) => (
                          <tr key={q.id}>
                            <td>{q.text}</td>
                            <td>{q.answer_text || <span className="muted">—</span>}</td>
                            <td>{q.answered_by_name || <span className="muted">—</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

export default function RequestViewModal({ open, proposal, onClose }) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal-window logs-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header-left">
            <h3>Request View</h3>
            <div className="muted small">( {proposal?.reference_no} )</div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="modal-body">
          <RequestViewContent proposal={proposal} enabled={open} />
        </div>
      </div>
    </div>
  );
}
