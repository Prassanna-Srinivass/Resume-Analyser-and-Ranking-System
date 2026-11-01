import React, { useEffect, useState } from "react";
import { api } from "./api";

const techniques = {
  "zero-shot": "Zero-shot",
  "few-shot": "Few-shot",
  "role-based": "Role-based",
  "structured-output": "Structured output",
  "step-by-step": "Step-by-step",
};
const hints = {
  "zero-shot": "Start with a clear task. No examples required.",
  "few-shot":
    "Include 2–3 input / output examples in your prompt, followed by the new task.",
  "role-based": "Name a role, your audience and the outcome you need.",
  "structured-output":
    "The model is asked for JSON with answer and key_points. Review the result; formatting is not guaranteed.",
  "step-by-step":
    "Ask for an actionable procedure or a concise, ordered explanation.",
};
const blank = {
  title: "",
  prompt_text: "",
  technique: "zero-shot",
  category: "General",
};
const starters = [
  {
    title: "Explain a complex idea",
    category: "Learning",
    technique: "zero-shot",
    template_text:
      "Explain machine learning to a first-year student. Use a familiar analogy and finish with three key takeaways.",
  },
  {
    title: "Find the pattern",
    category: "Classification",
    technique: "few-shot",
    template_text:
      "Classify the sentiment.\nInput: I loved the friendly service.\nOutput: positive\nInput: My order arrived damaged.\nOutput: negative\nInput: The package is on the table.\nOutput: neutral\n\nClassify the input provided in context.",
  },
  {
    title: "Your writing partner",
    category: "Writing",
    technique: "role-based",
    template_text:
      "Act as an experienced editor. Rewrite the text in context for clarity, keep its meaning, and explain your three most useful edits.",
  },
  {
    title: "Turn notes into JSON",
    category: "Productivity",
    technique: "structured-output",
    template_text:
      "Summarize the notes in context. Put a short summary in answer and actionable next steps in key_points.",
  },
  {
    title: "Build a learning plan",
    category: "Learning",
    technique: "step-by-step",
    template_text:
      "Create a practical seven-day beginner learning plan for the topic in context. Include one exercise per day and a way to check understanding.",
  },
];
function date(value) {
  return new Date(value).toLocaleString();
}
function Badge({ children }) {
  return <span className="badge">{children}</span>;
}
function Empty({ title, children }) {
  return (
    <div className="empty">
      <span className="empty-icon">✧</span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
function Rating({ run, onSave, busy }) {
  const [value, setValue] = useState({
    relevance_rating: run.relevance_rating || 3,
    clarity_rating: run.clarity_rating || 3,
    completeness_rating: run.completeness_rating || 3,
    feedback_note: run.feedback_note || "",
  });
  return (
    <form
      className="rating"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(run.id, value);
      }}
    >
      <h3>Your evaluation</h3>
      <p className="muted">Human feedback, based on your task.</p>
      <div className="rating-grid">
        {["relevance", "clarity", "completeness"].map((k) => (
          <label key={k}>
            {k}
            <select
              aria-label={`${k} rating for run ${run.id}`}
              value={value[k + "_rating"]}
              onChange={(e) =>
                setValue({ ...value, [k + "_rating"]: +e.target.value })
              }
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <label>
        Feedback note
        <textarea
          maxLength={4000}
          rows={2}
          value={value.feedback_note}
          onChange={(e) =>
            setValue({ ...value, feedback_note: e.target.value })
          }
        />
      </label>
      <button disabled={busy} className="secondary">
        Save evaluation
      </button>
    </form>
  );
}
function RunCard({ run, rate, busy, reuse }) {
  return (
    <article className="panel run-detail">
      <div className="section-heading">
        <h2>{run.title}</h2>
        <Badge>{run.is_demo ? "Demo simulation" : run.model_name}</Badge>
      </div>
      <div className="meta">
        Run #{run.id} · {techniques[run.technique]} · {date(run.created_at)} ·{" "}
        {run.latency_ms} ms
      </div>
      <h4>Original prompt</h4>
      <pre>{run.prompt_text}</pre>
      {run.input_text && (
        <>
          <h4>Context / input</h4>
          <pre>{run.input_text}</pre>
        </>
      )}
      <h4>Response</h4>
      <pre className="response-text">{run.response_text}</pre>
      <details>
        <summary>View final prompt sent to model</summary>
        <pre>{run.rendered_prompt}</pre>
      </details>
      <button className="secondary" disabled={busy} onClick={() => reuse(run)}>
        Reuse as a new prompt
      </button>
      <Rating
        key={
          run.id +
          ":" +
          run.feedback_note +
          ":" +
          run.relevance_rating +
          ":" +
          run.clarity_rating +
          ":" +
          run.completeness_rating
        }
        run={run}
        onSave={rate}
        busy={busy}
      />
    </article>
  );
}

export default function App() {
  const [page, setPage] = useState("Playground"),
    [config, setConfig] = useState(null),
    [prompts, setPrompts] = useState([]),
    [runs, setRuns] = useState([]),
    [templates, setTemplates] = useState([]),
    [stats, setStats] = useState({}),
    [editor, setEditor] = useState(blank),
    [promptId, setPromptId] = useState(null),
    [context, setContext] = useState(""),
    [model, setModel] = useState("demo-local"),
    [result, setResult] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState(""),
    [selected, setSelected] = useState([]),
    [opened, setOpened] = useState(null),
    [templateEdit, setTemplateEdit] = useState(null),
    [templateForm, setTemplateForm] = useState(null);
  async function refresh() {
    const [p, r, t, s] = await Promise.all([
      api("/prompts"),
      api("/runs"),
      api("/templates"),
      api("/dashboard"),
    ]);
    setPrompts(p);
    setRuns(r);
    setTemplates(t);
    setStats(s);
    return r;
  }
  useEffect(() => {
    (async () => {
      try {
        setConfig(await api("/config"));
        await refresh();
      } catch (e) {
        setError(e.message);
      }
    })();
  }, []);
  async function action(fn) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function navigate(p) {
    setPage(p);
    setSearch("");
    setFilter("");
    setOpened(null);
    setError("");
    setNotice("");
  }
  function usePrompt(p, existing = false) {
    setEditor({
      title: p.title,
      prompt_text: p.prompt_text || p.template_text,
      technique: p.technique,
      category: p.category,
    });
    setPromptId(existing ? p.id : null);
    setContext(p.input_text || "");
    setResult(null);
    navigate("Playground");
  }
  async function save() {
    const p = await api(
      promptId ? `/prompts/${promptId}` : "/prompts",
      promptId ? "PUT" : "POST",
      editor,
    );
    setPromptId(p.id);
    return p;
  }
  async function run() {
    setResult(null);
    const p = await save();
    const r = await api(`/prompts/${p.id}/run`, "POST", {
      model_name: model,
      input_text: context,
    });
    setResult(r);
    await refresh();
    setNotice("Run saved to history.");
  }
  async function rate(id, value) {
    await action(async () => {
      const r = await api(`/runs/${id}/rating`, "POST", value);
      setResult((current) => (current?.id === id ? r : current));
      setOpened((current) => (current?.id === id ? r : current));
      await refresh();
      setNotice("Evaluation saved.");
    });
  }
  async function remove(kind, id) {
    if (
      !window.confirm(
        `Delete this ${kind === "runs" ? "run" : kind === "prompts" ? "prompt (run history will be kept)" : "template"}?`,
      )
    )
      return;
    await action(async () => {
      await api(`/${kind}/${id}`, "DELETE");
      await refresh();
      if (kind === "runs") {
        setSelected((x) => x.filter((n) => n !== id));
        if (opened?.id === id) setOpened(null);
        if (result?.id === id) setResult(null);
      }
      if (kind === "prompts" && promptId === id) {
        setPromptId(null);
      }
      setNotice("Deleted.");
    });
  }
  function toggle(id) {
    setSelected((prev) =>
      prev.includes(id)
        ? prev.filter((n) => n !== id)
        : prev.length < 2
          ? [...prev, id]
          : [prev[1], id],
    );
  }
  function exportRuns() {
    const blob = new Blob([JSON.stringify(runs, null, 2)], {
        type: "application/json",
      }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = "prompt-runs.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  const found = (items) =>
    items.filter(
      (x) =>
        `${x.title} ${x.category} ${x.prompt_text || x.template_text || ""} ${x.response_text || ""}`
          .toLowerCase()
          .includes(search.toLowerCase()) &&
        (!filter || x.technique === filter),
    );
  const fields = (
    <>
      <label>
        Prompt title
        <input
          required
          maxLength={120}
          placeholder="e.g. Explain machine learning"
          value={editor.title}
          onChange={(e) => setEditor({ ...editor, title: e.target.value })}
        />
      </label>
      <div className="field-row">
        <label>
          Technique
          <select
            value={editor.technique}
            onChange={(e) =>
              setEditor({ ...editor, technique: e.target.value })
            }
          >
            {Object.entries(techniques).map(([key, name]) => (
              <option key={key} value={key}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Category
          <input
            required
            maxLength={80}
            value={editor.category}
            onChange={(e) => setEditor({ ...editor, category: e.target.value })}
          />
        </label>
      </div>
      <label>
        Your prompt
        <textarea
          required
          maxLength={20000}
          rows={8}
          placeholder="What would you like the model to do?"
          value={editor.prompt_text}
          onChange={(e) =>
            setEditor({ ...editor, prompt_text: e.target.value })
          }
        />
      </label>
      <div className="hint">✧ {hints[editor.technique]}</div>
      <label>
        Context / input <span className="muted">optional</span>
        <textarea
          maxLength={20000}
          rows={3}
          placeholder="Add source text, an audience, or extra details…"
          value={context}
          onChange={(e) => setContext(e.target.value)}
        />
      </label>
    </>
  );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("Dashboard");
          }}
        >
          <span className="brand-icon">✳</span>
          <span>
            Promptlab<small>ENGINEERING PLAYGROUND</small>
          </span>
        </a>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {[
            "Dashboard",
            "Playground",
            "Saved prompts",
            "History",
            "Compare",
            "Templates",
          ].map((p, i) => (
            <button
              key={p}
              className={page === p ? "nav-active" : ""}
              onClick={() => navigate(p)}
            >
              <span>{["◫", "✧", "▤", "◷", "⇄", "▦"][i]}</span>
              {p}
              {p === "Compare" && selected.length > 0 && (
                <b>{selected.length}</b>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="status-dot" /> Local workspace
          <p>
            A little iteration.
            <br />A better prompt.
          </p>
          <small>Single-user · SQLite storage</small>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <span>
            Workspace <span className="muted">/ {page}</span>
          </span>
          <Badge>
            {model === "demo-local" ? "● Demo mode" : "● Live model selected"}
          </Badge>
        </header>
        <div className="content">
          <div className="page-title">
            <div>
              <div className="eyebrow">EXPERIMENT. COMPARE. REFINE.</div>
              <h1>
                {page === "Playground"
                  ? "Good ideas start with a prompt."
                  : page === "Dashboard"
                    ? "Your experimentation workspace."
                    : page === "History"
                      ? "Every experiment, remembered."
                      : page === "Compare"
                        ? "A different perspective."
                        : page === "Templates"
                          ? "A head start for your next idea."
                          : "Your reusable prompt collection."}
              </h1>
              <p className="muted">
                {page === "Playground"
                  ? "Explore what a few thoughtful words can do."
                  : page === "Compare"
                    ? "Compare two saved runs side by side. You decide what works."
                    : "Keep your ideas, experiments and feedback in one place."}
              </p>
            </div>
            {page !== "Playground" && (
              <button
                className="primary"
                disabled={busy}
                onClick={() => {
                  setEditor(blank);
                  setPromptId(null);
                  setResult(null);
                  setContext("");
                  navigate("Playground");
                }}
              >
                ＋ New prompt
              </button>
            )}
          </div>
          {error && (
            <div role="alert" className="alert error">
              {error}
              <button
                onClick={() =>
                  action(async () => {
                    setConfig(await api("/config"));
                    await refresh();
                  })
                }
                disabled={busy}
              >
                Retry connection
              </button>
            </div>
          )}
          {notice && (
            <div role="status" className="alert success">
              {notice}
            </div>
          )}
          {!config && !error && (
            <p role="status">Connecting to your workspace…</p>
          )}
          {page === "Dashboard" && (
            <>
              <div className="stats">
                {[
                  ["Saved prompts", stats.prompts],
                  ["Total runs", stats.runs],
                  ["Evaluated runs", stats.rated_runs],
                  ["Your templates", stats.templates],
                ].map(([label, n]) => (
                  <div className="panel stat" key={label}>
                    <span>{label}</span>
                    <strong>{n || 0}</strong>
                  </div>
                ))}
              </div>
              <div className="panel">
                <div className="section-heading">
                  <h2>Recent experiments</h2>
                  <button className="link" onClick={() => navigate("History")}>
                    View all →
                  </button>
                </div>
                {runs.length ? (
                  runs.slice(0, 5).map((r) => (
                    <button
                      key={r.id}
                      className="recent"
                      onClick={() => {
                        navigate("History");
                        setOpened(r);
                      }}
                    >
                      <span>
                        <strong>{r.title}</strong>
                        <small>
                          {techniques[r.technique]} · {date(r.created_at)}
                        </small>
                      </span>
                      <Badge>{r.is_demo ? "Demo" : r.model_name}</Badge>
                    </button>
                  ))
                ) : (
                  <Empty title="Your first experiment awaits">
                    Create a prompt in the Playground, then run it to start your
                    history.
                  </Empty>
                )}
              </div>
            </>
          )}
          {page === "Playground" && (
            <div className="playground">
              <form
                className="panel editor"
                onSubmit={(e) => {
                  e.preventDefault();
                  action(run);
                }}
              >
                <div className="section-heading">
                  <h2>
                    <span className="mini-icon">✎</span> Prompt editor
                  </h2>
                  <Badge>
                    {promptId ? "Saved #" + promptId : "New experiment"}
                  </Badge>
                </div>
                <fieldset disabled={busy || !config}>
                  {fields}
                  <div className="run-controls">
                    <label>
                      Model
                      <select
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                      >
                        {(config?.models || ["demo-local"]).map((m) => (
                          <option key={m} value={m}>
                            {m === "demo-local"
                              ? "Demo · offline simulator"
                              : m}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="primary"
                      disabled={busy || !config}
                      type="submit"
                    >
                      {busy ? "Working…" : "Run prompt ↗"}
                    </button>
                  </div>
                  <div className="editor-actions">
                    <button
                      className="secondary"
                      type="button"
                      onClick={(e) => {
                        if (e.currentTarget.form.reportValidity())
                          action(async () => {
                            await save();
                            await refresh();
                            setNotice("Prompt saved.");
                          });
                      }}
                    >
                      Save prompt
                    </button>
                    <button
                      className="link"
                      type="button"
                      onClick={(e) => {
                        if (e.currentTarget.form.reportValidity()) {
                          setTemplateEdit(null);
                          setTemplateForm({
                            title: editor.title,
                            template_text: editor.prompt_text,
                            technique: editor.technique,
                            category: editor.category,
                          });
                          navigate("Templates");
                        }
                      }}
                    >
                      Save as template
                    </button>
                  </div>
                </fieldset>
              </form>
              <div className="panel output">
                <div className="section-heading">
                  <h2>
                    <span className="mini-icon">✧</span> Response
                  </h2>
                  {result && (
                    <Badge>
                      {result.is_demo ? "Demo simulation" : "AI generated"}
                    </Badge>
                  )}
                </div>
                {busy ? (
                  <div className="empty" role="status">
                    <span className="spinner" />
                    <h3>Working on your experiment…</h3>
                    <p>Live model requests can take up to a minute.</p>
                  </div>
                ) : result ? (
                  <>
                    <div className="meta">
                      {result.model_name} · {result.latency_ms} ms · Run #
                      {result.id}
                    </div>
                    <pre className="response-text">{result.response_text}</pre>
                    <div className="row">
                      <button
                        className="secondary"
                        onClick={() =>
                          action(async () => {
                            await navigator.clipboard.writeText(
                              result.response_text,
                            );
                            setNotice("Response copied.");
                          })
                        }
                      >
                        Copy response
                      </button>
                      <button
                        className="link"
                        onClick={() => {
                          toggle(result.id);
                          setNotice(
                            "Run selected for comparison. Open Compare to choose the other run.",
                          );
                        }}
                      >
                        ＋ Compare
                      </button>
                    </div>
                    <Rating
                      key={result.id}
                      run={result}
                      onSave={rate}
                      busy={busy}
                    />
                  </>
                ) : (
                  <Empty title="Make room for a new idea">
                    Your response will appear here.
                    <br />
                    Write a prompt, choose a technique, and hit run.
                  </Empty>
                )}
                <div className="output-note">
                  {model === "demo-local"
                    ? "Demo mode uses a deterministic simulator, not an AI model. Configure a backend API key and model for live responses."
                    : "AI responses may be inaccurate. Review before use."}
                </div>
              </div>
            </div>
          )}
          {["History", "Saved prompts", "Templates"].includes(page) && (
            <div className="toolbar">
              <input
                aria-label="Search workspace"
                placeholder="Search by title, content or category…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select
                aria-label="Filter technique"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="">All techniques</option>
                {Object.entries(techniques).map(([k, n]) => (
                  <option key={k} value={k}>
                    {n}
                  </option>
                ))}
              </select>
              {page === "History" && (
                <button
                  className="secondary"
                  onClick={exportRuns}
                  disabled={!runs.length}
                >
                  Export JSON
                </button>
              )}
              {page === "Templates" && (
                <button
                  className="secondary"
                  onClick={() => {
                    setTemplateEdit(null);
                    setTemplateForm({
                      title: "",
                      template_text: "",
                      technique: "zero-shot",
                      category: "General",
                    });
                  }}
                >
                  ＋ Create template
                </button>
              )}
            </div>
          )}
          {page === "Saved prompts" && (
            <div className="cards">
              {found(prompts).map((p) => (
                <article className="panel" key={p.id}>
                  <Badge>{p.category}</Badge>
                  <h2>{p.title}</h2>
                  <p className="preview">{p.prompt_text}</p>
                  <div className="meta">
                    {techniques[p.technique]} · {date(p.updated_at)}
                  </div>
                  <div className="row">
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => usePrompt(p, true)}
                    >
                      Open & edit
                    </button>
                    <button
                      className="link danger"
                      disabled={busy}
                      onClick={() => remove("prompts", p.id)}
                    >
                      Delete
                    </button>
                  </div>
                </article>
              ))}
              {!found(prompts).length && (
                <Empty title="No saved prompts">
                  Save your first prompt in the Playground or adjust your
                  search.
                </Empty>
              )}
            </div>
          )}
          {page === "History" &&
            (opened ? (
              <RunCard run={opened} busy={busy} rate={rate} reuse={usePrompt} />
            ) : (
              <>
                <div className="row space-between">
                  <p className="muted">
                    {found(runs).length} experiments · select up to two to
                    compare
                  </p>
                  <button
                    className="secondary"
                    disabled={selected.length !== 2}
                    onClick={() => navigate("Compare")}
                  >
                    Compare selected ({selected.length}/2)
                  </button>
                </div>
                <div className="history-list">
                  {found(runs).map((r) => (
                    <article className="panel history-item" key={r.id}>
                      <input
                        aria-label={`Compare run ${r.id}`}
                        type="checkbox"
                        checked={selected.includes(r.id)}
                        onChange={() => toggle(r.id)}
                      />
                      <div className="history-main">
                        <div className="section-heading">
                          <h2>{r.title}</h2>
                          <Badge>{r.is_demo ? "Demo" : r.model_name}</Badge>
                        </div>
                        <p className="preview">{r.response_text}</p>
                        <div className="meta">
                          #{r.id} · {techniques[r.technique]} ·{" "}
                          {date(r.created_at)}
                          {r.relevance_rating &&
                            ` · Rated ${r.relevance_rating}/${r.clarity_rating}/${r.completeness_rating}`}
                        </div>
                      </div>
                      <div className="history-actions">
                        <button
                          className="secondary"
                          onClick={() => setOpened(r)}
                        >
                          Open & rate
                        </button>
                        <button
                          className="link"
                          disabled={busy}
                          onClick={() => usePrompt(r)}
                        >
                          Reuse
                        </button>
                        <button
                          className="link danger"
                          disabled={busy}
                          onClick={() => remove("runs", r.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
                {!found(runs).length && (
                  <Empty title="No experiments yet">
                    Run a prompt, or adjust your search to see saved
                    experiments.
                  </Empty>
                )}
              </>
            ))}
          {page === "Compare" && (
            <>
              <div className="panel compare-picker">
                <h2>Choose your experiments</h2>
                <div className="field-row">
                  {[0, 1].map((slot) => (
                    <label key={slot}>
                      Run {slot === 0 ? "A" : "B"}
                      <select
                        aria-label={`Run ${slot === 0 ? "A" : "B"}`}
                        value={selected[slot] || ""}
                        onChange={(e) =>
                          setSelected((prev) => {
                            const next = [...prev];
                            next[slot] = +e.target.value;
                            return next;
                          })
                        }
                      >
                        <option value="">Choose a saved run</option>
                        {runs.map((r) => (
                          <option
                            key={r.id}
                            value={r.id}
                            disabled={selected[1 - slot] === r.id}
                          >
                            #{r.id} · {r.title} · {r.model_name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                <p className="muted">
                  Ratings are your subjective feedback. No automatic winner is
                  assigned.
                </p>
              </div>
              <div className="comparison">
                {[0, 1].map((slot) => {
                  const r = runs.find((r) => r.id === selected[slot]);
                  return r ? (
                    <RunCard
                      key={slot + ":" + r.id}
                      run={r}
                      busy={busy}
                      rate={rate}
                      reuse={usePrompt}
                    />
                  ) : (
                    <Empty
                      key={slot}
                      title={`Select run ${slot === 0 ? "A" : "B"}`}
                    >
                      Choose an experiment above to inspect its prompt, response
                      and feedback.
                    </Empty>
                  );
                })}
              </div>
            </>
          )}
          {page === "Templates" && (
            <>
              {templateForm && (
                <form
                  className="panel template-editor"
                  onSubmit={(e) => {
                    e.preventDefault();
                    action(async () => {
                      await api(
                        templateEdit
                          ? `/templates/${templateEdit}`
                          : "/templates",
                        templateEdit ? "PUT" : "POST",
                        templateForm,
                      );
                      setTemplateForm(null);
                      setTemplateEdit(null);
                      await refresh();
                      setNotice("Template saved.");
                    });
                  }}
                >
                  <h2>
                    {templateEdit
                      ? "Edit template"
                      : "Create a reusable template"}
                  </h2>
                  <fieldset disabled={busy}>
                    <label>
                      Template title
                      <input
                        required
                        maxLength={120}
                        value={templateForm.title}
                        onChange={(e) =>
                          setTemplateForm({
                            ...templateForm,
                            title: e.target.value,
                          })
                        }
                      />
                    </label>
                    <div className="field-row">
                      <label>
                        Category
                        <input
                          required
                          maxLength={80}
                          value={templateForm.category}
                          onChange={(e) =>
                            setTemplateForm({
                              ...templateForm,
                              category: e.target.value,
                            })
                          }
                        />
                      </label>
                      <label>
                        Technique
                        <select
                          value={templateForm.technique}
                          onChange={(e) =>
                            setTemplateForm({
                              ...templateForm,
                              technique: e.target.value,
                            })
                          }
                        >
                          {Object.entries(techniques).map(([k, n]) => (
                            <option key={k} value={k}>
                              {n}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label>
                      Template text
                      <textarea
                        required
                        rows={5}
                        maxLength={20000}
                        value={templateForm.template_text}
                        onChange={(e) =>
                          setTemplateForm({
                            ...templateForm,
                            template_text: e.target.value,
                          })
                        }
                      />
                    </label>
                    <div className="row">
                      <button className="primary">Save template</button>
                      <button
                        className="secondary"
                        type="button"
                        onClick={() => setTemplateForm(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </fieldset>
                </form>
              )}
              <h2 className="subheading">
                Your templates <span className="muted">{templates.length}</span>
              </h2>
              <div className="cards">
                {found(templates).map((t) => (
                  <article className="panel" key={t.id}>
                    <Badge>{t.category}</Badge>
                    <h2>{t.title}</h2>
                    <p className="preview">{t.template_text}</p>
                    <details>
                      <summary>Preview full template</summary>
                      <pre>{t.template_text}</pre>
                    </details>
                    <div className="meta">{techniques[t.technique]}</div>
                    <div className="row wrap">
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() => usePrompt(t)}
                      >
                        Use template
                      </button>
                      <button
                        className="link"
                        onClick={() => {
                          setTemplateEdit(t.id);
                          setTemplateForm({
                            title: t.title,
                            template_text: t.template_text,
                            category: t.category,
                            technique: t.technique,
                          });
                        }}
                      >
                        Edit
                      </button>
                      <button
                        className="link danger"
                        disabled={busy}
                        onClick={() => remove("templates", t.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              {!found(templates).length && (
                <p className="muted">
                  No matching custom templates. Start with a preset below or
                  create your own.
                </p>
              )}
              <h2 className="subheading">Curated starting points</h2>
              <div className="cards">
                {found(starters).map((t) => (
                  <article className="panel starter" key={t.title}>
                    <Badge>{techniques[t.technique]}</Badge>
                    <h2>{t.title}</h2>
                    <p>{t.template_text}</p>
                    <button
                      className="link"
                      disabled={busy}
                      onClick={() => usePrompt(t)}
                    >
                      Try this prompt ↗
                    </button>
                  </article>
                ))}
              </div>
            </>
          )}
          <footer>
            Built for curious minds.{" "}
            <span>
              Responses are experiments. Always review AI-generated content.
            </span>
          </footer>
        </div>
      </main>
    </div>
  );
}
