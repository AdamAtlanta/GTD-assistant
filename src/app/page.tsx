"use client";

import Image from "next/image";
import React, { useState } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import {
  archiveEmailAction,
  completeTaskAction,
  createTaskFromEmailAction,
  createTaskFromEventAction,
  deleteEmailAction,
  runGTDAudit,
} from "./actions";

import { getErrorMessage } from "@/lib/errors";
import {
  GTD_TASK_LIST_OPTIONS,
  type DashboardData,
  type DashboardEmail,
  type DashboardEvent,
} from "@/lib/gtd";

export default function Dashboard() {
  const { data: session, status } = useSession();
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [processingTasks, setProcessingTasks] = useState<Set<string>>(new Set());
  const [processingEmailActions, setProcessingEmailActions] = useState<
    Record<string, "archive" | "delete">
  >({});
  const [processingEmailToTask, setProcessingEmailToTask] = useState<Set<string>>(new Set());
  const [processingEventToTask, setProcessingEventToTask] = useState<Set<string>>(new Set());

  const [emailToList, setEmailToList] = useState<Record<string, string>>({});
  const [emailTaskTitle, setEmailTaskTitle] = useState<Record<string, string>>({});
  const [eventToList, setEventToList] = useState<Record<string, string>>({});
  const [eventTaskTitle, setEventTaskTitle] = useState<Record<string, string>>({});
  const [eventDeleteMap, setEventDeleteMap] = useState<Record<string, boolean>>({});

  const handleRunAudit = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await runGTDAudit();
      if (result.success) {
        setReport(result.report);
      } else {
        setError(result.error);
      }
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteTask = async (taskListId: string, taskId: string) => {
    setProcessingTasks((current) => new Set(current).add(taskId));
    try {
      const res = await completeTaskAction(taskListId, taskId);
      if (!res.success) {
        console.error(res.error);
        alert("Failed to complete task");
        return;
      }

      if (report) {
        setReport({ ...report, tasks: report.tasks.filter((task) => task.id !== taskId) });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setProcessingTasks((current) => {
        const next = new Set(current);
        next.delete(taskId);
        return next;
      });
    }
  };

  const handleArchiveEmail = async (messageId: string) => {
    setProcessingEmailActions((current) => ({ ...current, [messageId]: "archive" }));
    try {
      const res = await archiveEmailAction(messageId);
      if (!res.success) {
        console.error(res.error);
        alert("Failed to archive email");
        return;
      }

      if (report) {
        setReport({ ...report, emails: report.emails.filter((email) => email.id !== messageId) });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setProcessingEmailActions((current) => {
        const next = { ...current };
        delete next[messageId];
        return next;
      });
    }
  };

  const handleDeleteEmail = async (messageId: string) => {
    setProcessingEmailActions((current) => ({ ...current, [messageId]: "delete" }));
    try {
      const res = await deleteEmailAction(messageId);
      if (!res.success) {
        console.error(res.error);
        alert("Failed to delete email");
        return;
      }

      if (report) {
        setReport({ ...report, emails: report.emails.filter((email) => email.id !== messageId) });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setProcessingEmailActions((current) => {
        const next = { ...current };
        delete next[messageId];
        return next;
      });
    }
  };

  const handleConvertEmail = async (email: DashboardEmail) => {
    const listName = emailToList[email.id] || "Next Action";
    const title = (emailTaskTitle[email.id] || email.proposedAction || email.subject).trim();

    if (!title) {
      alert("Please enter the task title you want to create.");
      return;
    }

    setProcessingEmailToTask((current) => new Set(current).add(email.id));
    try {
      const res = await createTaskFromEmailAction(email.id, listName, title);
      if (res.success && report) {
        setReport({ ...report, emails: report.emails.filter((item) => item.id !== email.id) });
      } else {
        alert("Failed to convert email to task");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setProcessingEmailToTask((current) => {
        const next = new Set(current);
        next.delete(email.id);
        return next;
      });
    }
  };

  const handleConvertEvent = async (event: DashboardEvent) => {
    const listName = eventToList[event.id] || "Next Action";
    const deleteOriginal = eventDeleteMap[event.id] || false;
    const title = (eventTaskTitle[event.id] || event.title).trim();

    if (!title) {
      alert("Please enter the task title you want to create.");
      return;
    }

    setProcessingEventToTask((current) => new Set(current).add(event.id));
    try {
      const res = await createTaskFromEventAction(event.id, deleteOriginal, listName, title);
      if (res.success && report) {
        setReport({ ...report, events: report.events.filter((item) => item.id !== event.id) });
      } else {
        alert("Failed to convert event to task");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setProcessingEventToTask((current) => {
        const next = new Set(current);
        next.delete(event.id);
        return next;
      });
    }
  };

  if (status === "loading") {
    return <div className="min-h-screen flex items-center justify-center text-[#9ca3af]">Loading GTD Workspace...</div>;
  }

  if (status === "unauthenticated") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center animate-fade-in text-center p-6">
        <div className="h-16 w-16 mb-6 rounded-2xl bg-gradient-to-tr from-blue-600 to-purple-600 p-[2px]">
            <div className="h-full w-full rounded-2xl bg-[#1a1d24] flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
            </div>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2">GTD Assistant</h1>
        <p className="text-[#9ca3af] mb-8 text-sm max-w-xs mx-auto">Your automated brain dump and alignment system powered by Gemini.</p>
        <button 
          onClick={() => signIn("google")}
          className="bg-white text-black font-semibold rounded-full px-8 py-3 w-full max-w-sm hover:scale-105 transition-transform"
        >
          Sign in with Google
        </button>
      </div>
    );
  }

  const tasksByList = report?.tasks?.reduce((acc, task) => {
    const ln = task.listName || "Uncategorized";
    if (!acc[ln]) acc[ln] = [];
    acc[ln].push(task);
    return acc;
  }, {} as Record<string, DashboardData["tasks"]>) || {};

  return (
    <div className="pt-12 pb-24 animate-fade-in flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Hello, <span className="text-gradient">{session?.user?.name?.split(' ')[0] || "Adam"}</span>
          </h1>
          <button onClick={() => signOut()} className="h-10 w-10 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 p-[2px] overflow-hidden">
            {session?.user?.image ? (
              <Image
                src={session.user.image}
                alt="Avatar"
                width={40}
                height={40}
                sizes="40px"
                className="h-full w-full rounded-full object-cover border border-[#1a1d24]"
              />
            ) : (
              <div className="h-full w-full rounded-full bg-[#1a1d24] flex items-center justify-center">
                <span className="text-sm font-semibold">{session?.user?.name?.[0] || "A"}</span>
              </div>
            )}
          </button>
        </div>
        <p className="text-[#9ca3af] text-sm">Let&apos;s align your GTD system today.</p>
      </header>

      <button 
        onClick={handleRunAudit}
        disabled={loading}
        className="glass-card p-5 text-left group hover:scale-[1.02] transition-transform duration-300 relative overflow-hidden disabled:opacity-50 disabled:hover:scale-100"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-blue-600/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="flex items-center justify-between mb-3">
          <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20 text-blue-400">
            {loading ? (
              <div className="animate-spin h-5 w-5 border-2 border-blue-400 border-t-transparent rounded-full" />
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
            )}
          </div>
          <span className="text-xs font-medium px-2 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
            {loading ? "Processing..." : "Ready"}
          </span>
        </div>
        <h2 className="text-lg font-semibold text-white mb-1">
          {loading ? "Aligning Workspace..." : "Brain Dump & Alignment"}
        </h2>
        <p className="text-sm text-[#9ca3af]">
          {loading ? "Analyzing Tasks, Calendar, and Emails." : "Process Google Tasks, Calendar & Gmail via Gemini."}
        </p>
      </button>

      {error && (
        <div className="glass-card border-red-500/30 p-4">
          <p className="text-red-400 text-sm font-medium">{error}</p>
        </div>
      )}

      {report && (
        <div className="flex flex-col gap-6 animate-fade-in relative z-20">
          
          <section className="glass-card p-6">
            <h3 className="text-xl font-bold text-white mb-4 border-b border-white/10 pb-2">Your Tasks</h3>
            <div className="flex flex-col gap-1">
              {Object.keys(tasksByList).length === 0 ? <p className="text-sm text-[#9ca3af]">No tasks found.</p> : null}
              {Object.entries(tasksByList).map(([listName, tasks]) => (
                <div key={listName} className="mb-6 last:mb-0">
                  <h4 className="text-[15px] font-semibold text-blue-300 mb-3 ml-1 uppercase tracking-wider">{listName}</h4>
                  <div className="flex flex-col gap-3">
                    {tasks.map(task => (
                      <div key={task.id} className="group flex items-start justify-between p-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors">
                        <div className="flex gap-3 pr-4 items-start w-full">
                          <button 
                            onClick={() => handleCompleteTask(task.listId, task.id)}
                            disabled={processingTasks.has(task.id)}
                            className="flex-shrink-0 mt-0.5 h-6 w-6 rounded-full border border-[#9ca3af] flex items-center justify-center hover:bg-green-500/20 hover:border-green-500 transition-colors disabled:opacity-50 relative"
                          >
                            {processingTasks.has(task.id) && <div className="absolute inset-0 rounded-full border-2 border-t-transparent animate-spin border-[#9ca3af]" />}
                            <svg className="w-3.5 h-3.5 text-transparent group-hover:text-green-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                          </button>
                          <div className="flex flex-col gap-1 w-full relative">
                            <span className={`text-sm font-medium text-white transition-all duration-300 ${processingTasks.has(task.id) ? 'line-through text-[#9ca3af]' : ''}`}>
                               {task.title}
                            </span>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs text-[#9ca3af] bg-black/30 w-fit px-2 py-0.5 rounded-md">{task.contextOrPerson}</span>
                              <span className="text-xs text-[#9ca3af] bg-white/5 w-fit px-2 py-0.5 rounded-md">
                                Added {task.addedDate}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="glass-card p-6">
            <h3 className="text-xl font-bold text-white mb-4 border-b border-white/10 pb-2">Calendar Review</h3>
            <div className="flex flex-col gap-3">
               {!report.events || report.events.length === 0 ? <p className="text-sm text-[#9ca3af]">No events found.</p> : report.events.map((evt, i) => (
                 <div key={evt.id || i} className={`p-4 rounded-xl border-l-2 bg-gradient-to-r relative group ${evt.isTrial ? 'border-purple-500 from-purple-500/10 to-transparent' : evt.type === 'past' ? 'border-gray-500 from-gray-500/5 to-transparent' : 'border-blue-500 from-blue-500/10 to-transparent'}`}>
                   <p className={`text-sm ${evt.isTrial ? 'font-bold text-white' : 'font-medium text-gray-200'}`}>{evt.title}</p>
                   <p className="text-xs text-[#9ca3af] mt-1">{evt.date}</p>

                   <label className="mt-3 flex flex-col gap-1 text-xs text-[#9ca3af]">
                     Task title to create
                     <input
                       type="text"
                       value={eventTaskTitle[evt.id] ?? evt.title}
                       onChange={(e) =>
                         setEventTaskTitle((current) => ({
                           ...current,
                           [evt.id]: e.target.value,
                         }))
                       }
                       className="rounded-lg border border-white/10 bg-[#1a1d24] px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                     />
                   </label>
                   
                   <div className="mt-3 flex items-center gap-3 pt-3 border-t border-white/5 flex-wrap">
                      <select
                        className="bg-[#1a1d24] text-xs text-white border border-white/10 rounded-md px-2 py-1.5 focus:outline-none focus:border-blue-500"
                        value={eventToList[evt.id] || "Next Action"}
                        onChange={(e) => setEventToList({ ...eventToList, [evt.id]: e.target.value })}
                      >
                        {GTD_TASK_LIST_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                      <label className="flex items-center gap-1.5 text-xs text-[#9ca3af] cursor-pointer hover:text-white transition-colors">
                        <input type="checkbox" className="rounded bg-[#1a1d24] border-white/10 cursor-pointer accent-red-500" 
                          checked={eventDeleteMap[evt.id] || false}
                          onChange={(e) => setEventDeleteMap({ ...eventDeleteMap, [evt.id]: e.target.checked })}
                        />
                        Delete event
                      </label>
                      <button 
                        onClick={() => handleConvertEvent(evt)}
                        disabled={processingEventToTask.has(evt.id)}
                        className="text-xs font-semibold px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white transition-colors disabled:opacity-50 ml-auto"
                      >
                        {processingEventToTask.has(evt.id) ? 'Converting...' : 'Convert to Task'}
                      </button>
                  </div>
                 </div>
               ))}
            </div>
          </section>

          <section className="glass-card p-6">
            <h3 className="text-xl font-bold text-white mb-4 border-b border-white/10 pb-2">Email Triage</h3>
            <div className="flex flex-col gap-3">
              {!report.emails || report.emails.length === 0 ? <p className="text-sm text-[#9ca3af]">Inbox Zero!</p> : report.emails.map(email => (
                <div key={email.id} className="flex flex-col gap-2 p-4 rounded-xl bg-gradient-to-tr from-white/5 to-white/0 border border-white/5 relative">
                  <h4 className="text-sm font-semibold text-white pr-20">{email.subject}</h4>
                  <p className="text-xs text-[#9ca3af] leading-relaxed">{email.summary}</p>
                  <div className="mt-2 text-xs font-medium text-blue-400 bg-blue-500/10 p-3 rounded-lg border border-blue-500/20">
                    <span className="font-bold text-blue-300">Suggested Action:</span> {email.proposedAction}
                  </div>

                  <label className="mt-2 flex flex-col gap-1 text-xs text-[#9ca3af]">
                    Task title to create
                    <input
                      type="text"
                      value={emailTaskTitle[email.id] ?? email.proposedAction ?? email.subject}
                      onChange={(e) =>
                        setEmailTaskTitle((current) => ({
                          ...current,
                          [email.id]: e.target.value,
                        }))
                      }
                      className="rounded-lg border border-white/10 bg-[#1a1d24] px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                    />
                  </label>
                  
                  <div className="mt-2 flex items-center justify-between gap-3 pt-2">
                    <div className="flex items-center gap-2 bg-black/20 p-1.5 rounded-lg border border-white/5 shadow-inner">
                      <select
                        className="bg-transparent text-xs text-white focus:outline-none px-2 py-1 appearance-none cursor-pointer hover:text-blue-300 transition-colors"
                        value={emailToList[email.id] || "Next Action"}
                        onChange={(e) => setEmailToList({ ...emailToList, [email.id]: e.target.value })}
                      >
                        {GTD_TASK_LIST_OPTIONS.map((option) => (
                          <option key={option} value={option} className="bg-[#1a1d24]">
                            {option}
                          </option>
                        ))}
                      </select>
                      <button 
                        onClick={() => handleConvertEmail(email)}
                        disabled={processingEmailToTask.has(email.id)}
                        className="text-xs font-semibold px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-50 shadow-lg shadow-blue-500/20"
                      >
                        {processingEmailToTask.has(email.id) ? 'Converting...' : 'Convert to Task'}
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => handleArchiveEmail(email.id)}
                        disabled={Boolean(processingEmailActions[email.id])}
                        className="text-xs font-semibold px-3 py-1.5 rounded-md border border-white/10 hover:bg-white/10 text-[#9ca3af] hover:text-white transition-colors disabled:opacity-50"
                      >
                        {processingEmailActions[email.id] === "archive" ? "Archiving..." : "Archive"}
                      </button>
                      <button
                        onClick={() => handleDeleteEmail(email.id)}
                        disabled={Boolean(processingEmailActions[email.id])}
                        className="text-xs font-semibold px-3 py-1.5 rounded-md border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                      >
                        {processingEmailActions[email.id] === "delete" ? "Deleting..." : "Delete (Trash)"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="glass-card p-6">
            <h3 className="text-xl font-bold text-white mb-4 border-b border-white/10 pb-2">Mind Sweep</h3>
            <ul className="flex flex-col gap-3 list-none pl-0">
              {!report.mindSweep || report.mindSweep.length === 0 ? <p className="text-sm text-[#9ca3af]">No questions generated.</p> : report.mindSweep.map((q, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-[#9ca3af]">
                  <span className="flex-shrink-0 h-6 w-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-bold">{i+1}</span>
                  <span className="mt-0.5">{q}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
