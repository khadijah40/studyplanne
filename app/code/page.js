"use client"
import React, { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  Calendar,
  Clock,
  Plus,
  Trash2,
  AlertCircle,
  Download,
  X,
  Send,
  Loader2,
  Sparkles,
  BookOpen,
  Target,
  TrendingUp,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";

const StudyPlanner = () => {
  const [step, setStep] = useState(1);
  const [goal, setGoal] = useState("");
  const [goalType, setGoalType] = useState("exam");
  const [deadline, setDeadline] = useState("");
  const [topics, setTopics] = useState([
    { name: "", difficulty: "medium", priority: "medium" },
  ]);
  const [availability, setAvailability] = useState({
    monday: [],
    tuesday: [],
    wednesday: [],
    thursday: [],
    friday: [],
    saturday: [],
    sunday: [],
  });
  const [schedule, setSchedule] = useState(null);
  const [sessionLength, setSessionLength] = useState(90);

  // AI Chatbox states
  const [showChat, setShowChat] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const proTips = [
    "Take 5-10 minute breaks between sessions.",
    "Stay hydrated.",
    "Review difficult topics multiple times.",
    "Don't cram - space out your study sessions.",
    "Use active recall instead of passive reading.",
    "Teach someone else what you learned to reinforce memory.",
    "Sleep well to retain what you study.",
  ];

  const getRandomTips = (count) => {
    const shuffled = [...proTips].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  };

  const randomTips = getRandomTips(3);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage = { type: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: input,
          conversationHistory: messages,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to get response");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = "";

      // Add empty assistant message that we'll update as we stream
      setMessages((prev) => [...prev, { type: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") break;

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content || "";
              if (content) {
                assistantMessage += content;
                // Update the last message with accumulated content
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    type: "assistant",
                    content: assistantMessage,
                  };
                  return updated;
                });
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }
    } catch (error) {
      console.error(error);
      setMessages((prev) => [
        ...prev,
        {
          type: "assistant",
          content: "Sorry, there was an error processing your request.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const addTopic = () => {
    setTopics([
      ...topics,
      { name: "", difficulty: "medium", priority: "medium" },
    ]);
  };

  const removeTopic = (index) => {
    setTopics(topics.filter((_, i) => i !== index));
  };

  const updateTopic = (index, field, value) => {
    const newTopics = [...topics];
    newTopics[index][field] = value;
    setTopics(newTopics);
  };

  const addTimeSlot = (day) => {
    const newAvailability = { ...availability };
    newAvailability[day].push({ start: "09:00", end: "11:00" });
    setAvailability(newAvailability);
  };

  const removeTimeSlot = (day, index) => {
    const newAvailability = { ...availability };
    newAvailability[day].splice(index, 1);
    setAvailability(newAvailability);
  };

  const updateTimeSlot = (day, index, field, value) => {
    const newAvailability = { ...availability };
    newAvailability[day][index][field] = value;
    setAvailability(newAvailability);
  };

  const generateSchedule = () => {
    const validTopics = topics.filter((t) => t.name.trim());
    if (validTopics.length === 0) {
      alert("Please add at least one topic");
      return;
    }

    const days = [
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ];
    const dayNames = [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ];

    let totalMinutes = 0;
    days.forEach((day) => {
      availability[day].forEach((slot) => {
        const start = slot.start.split(":").map(Number);
        const end = slot.end.split(":").map(Number);
        const minutes = end[0] * 60 + end[1] - (start[0] * 60 + start[1]);
        totalMinutes += minutes;
      });
    });

    const weightedTopics = validTopics.map((topic) => {
      let weight = 1;
      if (topic.difficulty === "hard") weight *= 1.5;
      if (topic.difficulty === "easy") weight *= 0.7;
      if (topic.priority === "high") weight *= 1.3;
      if (topic.priority === "low") weight *= 0.8;
      return { ...topic, weight, sessions: [] };
    });

    const totalWeight = weightedTopics.reduce((sum, t) => sum + t.weight, 0);

    weightedTopics.forEach((topic) => {
      topic.allocatedMinutes = Math.round(
        (topic.weight / totalWeight) * totalMinutes * 0.85
      );
    });

    const scheduleData = [];
    let currentDate = new Date();
    const deadlineDate = new Date(deadline);

    for (let i = 0; i < 14 && currentDate <= deadlineDate; i++) {
      const dayOfWeek =
        days[currentDate.getDay() === 0 ? 6 : currentDate.getDay() - 1];
      const dayName =
        dayNames[currentDate.getDay() === 0 ? 6 : currentDate.getDay() - 1];
      const dateStr = currentDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });

      const daySlots = availability[dayOfWeek];

      if (daySlots.length > 0) {
        const daySessions = [];

        daySlots.forEach((slot) => {
          const needyTopic = weightedTopics
            .filter((t) => {
              const usedMinutes = t.sessions.reduce(
                (sum, s) => sum + s.duration,
                0
              );
              return usedMinutes < t.allocatedMinutes;
            })
            .sort((a, b) => {
              const aUsed = a.sessions.reduce((sum, s) => sum + s.duration, 0);
              const bUsed = b.sessions.reduce((sum, s) => sum + s.duration, 0);
              const aRemaining = a.allocatedMinutes - aUsed;
              const bRemaining = b.allocatedMinutes - bUsed;
              return bRemaining - aRemaining;
            })[0];

          if (needyTopic) {
            const sessionDuration = Math.min(
              sessionLength,
              parseInt(slot.end.split(":")[0]) * 60 +
                parseInt(slot.end.split(":")[1]) -
                (parseInt(slot.start.split(":")[0]) * 60 +
                  parseInt(slot.start.split(":")[1]))
            );

            needyTopic.sessions.push({
              duration: sessionDuration,
              date: dateStr,
            });

            daySessions.push({
              topic: needyTopic.name,
              time: `${slot.start} - ${slot.end}`,
              duration: sessionDuration,
              type: "learning",
              difficulty: needyTopic.difficulty,
            });
          }
        });

        if (daySessions.length > 0) {
          scheduleData.push({
            date: dateStr,
            day: dayName,
            sessions: daySessions,
          });
        }
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    const lastDays = scheduleData.slice(-3);
    lastDays.forEach((day) => {
      if (day.sessions.length < 2) {
        const hardTopics = weightedTopics.filter(
          (t) => t.difficulty === "hard" || t.priority === "high"
        );
        if (hardTopics.length > 0) {
          day.sessions.push({
            topic:
              hardTopics[Math.floor(Math.random() * hardTopics.length)].name,
            time: "Flexible",
            duration: 45,
            type: "revision",
            difficulty: "revision",
          });
        }
      }
    });

    setSchedule(scheduleData);
    setStep(4);
  };

  const exportScheduleToPDF = () => {
    const doc = new jsPDF();

    // Add gradient-like header with modern styling
    doc.setFillColor(79, 70, 229); // Indigo
    doc.rect(0, 0, 210, 45, 'F');

    // Title
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(28);
    doc.setFont(undefined, 'bold');
    doc.text('Study Schedule', 105, 20, { align: 'center' });

    // Subtitle
    doc.setFontSize(14);
    doc.setFont(undefined, 'normal');
    doc.text(goal, 105, 30, { align: 'center' });

    // Deadline info
    doc.setFontSize(10);
    doc.text(`Deadline: ${new Date(deadline).toLocaleDateString()} | ${goalType.toUpperCase()}`, 105, 38, { align: 'center' });

    // Reset text color
    doc.setTextColor(0, 0, 0);

    // Summary section
    const totalHours = getTotalStudyHours().toFixed(1);
    const totalSessions = schedule.reduce((sum, day) => sum + day.sessions.length, 0);

    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(79, 70, 229);
    doc.text('Summary', 14, 55);

    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(55, 65, 81);
    doc.text(`Total Study Time: ${totalHours} hours`, 14, 62);
    doc.text(`Total Sessions: ${totalSessions}`, 14, 68);
    doc.text(`Session Length: ${sessionLength} minutes`, 14, 74);

    let yPosition = 85;

    // Schedule details
    schedule.forEach((day, dayIndex) => {
      // Check if we need a new page
      if (yPosition > 250) {
        doc.addPage();
        yPosition = 20;
      }

      // Day header
      doc.setFillColor(243, 244, 246);
      doc.roundedRect(14, yPosition - 5, 182, 10, 2, 2, 'F');

      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(31, 41, 55);
      doc.text(`${day.day}, ${day.date}`, 16, yPosition + 2);

      yPosition += 12;

      // Sessions table
      const tableData = day.sessions.map(session => {
        const typeIcon = session.type === 'revision' ? '↻' : '📖';
        const difficultyColor = session.difficulty === 'hard' ? '🔴' :
                               session.difficulty === 'medium' ? '🟡' : '🟢';
        return [
          `${typeIcon} ${session.topic}`,
          session.time,
          `${session.duration} min`,
          session.difficulty === 'revision' ? 'Revision' : difficultyColor
        ];
      });

      autoTable(doc, {
        startY: yPosition,
        head: [['Topic', 'Time', 'Duration', 'Level']],
        body: tableData,
        theme: 'striped',
        headStyles: {
          fillColor: [79, 70, 229],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 10
        },
        bodyStyles: {
          fontSize: 9,
          textColor: [55, 65, 81]
        },
        alternateRowStyles: {
          fillColor: [249, 250, 251]
        },
        margin: { left: 14, right: 14 },
        columnStyles: {
          0: { cellWidth: 80 },
          1: { cellWidth: 45 },
          2: { cellWidth: 30 },
          3: { cellWidth: 25, halign: 'center' }
        }
      });

      yPosition = doc.lastAutoTable.finalY + 8;
    });

    // Pro Tips section
    if (yPosition > 230) {
      doc.addPage();
      yPosition = 20;
    }

    doc.setFillColor(254, 243, 199);
    doc.roundedRect(14, yPosition, 182, 35, 3, 3, 'F');

    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(146, 64, 14);
    doc.text('💡 Pro Tips', 18, yPosition + 8);

    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(120, 53, 15);
    randomTips.forEach((tip, index) => {
      doc.text(`• ${tip}`, 18, yPosition + 16 + (index * 6));
    });

    // Footer
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(156, 163, 175);
      doc.text(
        `Page ${i} of ${pageCount} | Generated with Study Planner`,
        105,
        290,
        { align: 'center' }
      );
    }

    // Save the PDF
    doc.save(`Study-Schedule-${goal.replace(/\s+/g, '-')}.pdf`);
  };

  const getTotalStudyHours = () => {
    if (!schedule) return 0;
    return (
      schedule.reduce(
        (total, day) =>
          total + day.sessions.reduce((sum, s) => sum + s.duration, 0),
        0
      ) / 60
    );
  };

  const goalTypeIcons = {
    exam: "🎯",
    midterm: "📝",
    project: "🚀",
    presentation: "🎤",
    assignment: "📄",
    quiz: "❓",
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-12 max-w-6xl">
        {/* Header */}
        <div className="text-center mb-8 sm:mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-3 rounded-2xl shadow-lg">
              <BookOpen className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
              Study Planner
            </h1>
          </div>
          <p className="text-gray-600 text-sm sm:text-base">
            Create your personalized study schedule with AI assistance
          </p>
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          {/* Progress Steps */}
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-4 sm:px-8 py-6">
            <div className="flex justify-between items-center mb-4">
              {[
                { label: "Goal", icon: Target },
                { label: "Topics", icon: BookOpen },
                { label: "Schedule", icon: Calendar },
                { label: "Done", icon: CheckCircle2 },
              ].map((item, idx) => (
                <div
                  key={idx}
                  className={`flex flex-col items-center gap-2 ${
                    step > idx + 1 ? "opacity-100" : step === idx + 1 ? "opacity-100" : "opacity-50"
                  }`}
                >
                  <div
                    className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all ${
                      step > idx + 1
                        ? "bg-white text-indigo-600"
                        : step === idx + 1
                        ? "bg-white text-indigo-600 ring-4 ring-white/30"
                        : "bg-indigo-500 text-white"
                    }`}
                  >
                    <item.icon className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  <span className="text-white text-xs sm:text-sm font-medium hidden sm:block">
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
            <div className="h-2 bg-indigo-400 rounded-full overflow-hidden">
              <div
                className="h-full bg-white transition-all duration-500 ease-out rounded-full"
                style={{ width: `${(step / 4) * 100}%` }}
              />
            </div>
          </div>

          {/* Content */}
          <div className="p-4 sm:p-8 lg:p-12">
            {/* Step 1: Goal Setting */}
            {step === 1 && (
              <div className="space-y-6 animate-fadeIn">
                <div className="text-center mb-8">
                  <h2 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">
                    What's your goal?
                  </h2>
                  <p className="text-gray-600">Let's start by setting up your study objective</p>
                </div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                  {[
                    { value: "exam", label: "Final Exam", icon: "🎯" },
                    { value: "midterm", label: "Midterm", icon: "📝" },
                    { value: "project", label: "Project", icon: "🚀" },
                    { value: "presentation", label: "Presentation", icon: "🎤" },
                    { value: "assignment", label: "Assignment", icon: "📄" },
                    { value: "quiz", label: "Quiz", icon: "❓" },
                  ].map((type) => (
                    <button
                      key={type.value}
                      onClick={() => setGoalType(type.value)}
                      className={`p-4 sm:p-6 rounded-xl border-2 transition-all hover:scale-105 ${
                        goalType === type.value
                          ? "border-indigo-600 bg-indigo-50 shadow-lg"
                          : "border-gray-200 hover:border-indigo-300"
                      }`}
                    >
                      <div className="text-3xl sm:text-4xl mb-2">{type.icon}</div>
                      <div className="font-semibold text-gray-800 text-sm sm:text-base">{type.label}</div>
                    </button>
                  ))}
                </div>

                <div className="space-y-4 mt-8">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Course/Subject Name
                    </label>
                    <input
                      type="text"
                      value={goal}
                      onChange={(e) => setGoal(e.target.value)}
                      placeholder="e.g., Data Structures & Algorithms"
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-indigo-600 focus:ring-4 focus:ring-indigo-100 transition-all outline-none text-gray-800"
                    />
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Deadline
                      </label>
                      <input
                        type="date"
                        value={deadline}
                        onChange={(e) => setDeadline(e.target.value)}
                        min={new Date().toISOString().split("T")[0]}
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-indigo-600 focus:ring-4 focus:ring-indigo-100 transition-all outline-none text-gray-800"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Session Length
                      </label>
                      <select
                        value={sessionLength}
                        onChange={(e) => setSessionLength(Number(e.target.value))}
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-indigo-600 focus:ring-4 focus:ring-indigo-100 transition-all outline-none text-gray-800"
                      >
                        <option value={45}>45 minutes</option>
                        <option value={60}>60 minutes</option>
                        <option value={90}>90 minutes</option>
                        <option value={120}>120 minutes</option>
                      </select>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() =>
                    goal && deadline
                      ? setStep(2)
                      : alert("Please fill in all fields")
                  }
                  className="w-full mt-8 bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-4 rounded-xl font-semibold hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2 text-base sm:text-lg"
                >
                  Continue to Topics
                  <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            )}

            {/* Step 2: Topics */}
            {step === 2 && (
              <div className="space-y-6 animate-fadeIn">
                <div className="text-center mb-8">
                  <h2 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">
                    What topics will you cover?
                  </h2>
                  <p className="text-gray-600">Add all the topics you need to study</p>
                </div>

                <div className="space-y-4">
                  {topics.map((topic, index) => (
                    <div
                      key={index}
                      className="bg-gradient-to-r from-gray-50 to-indigo-50 rounded-xl p-4 sm:p-6 border-2 border-gray-200 hover:border-indigo-300 transition-all"
                    >
                      <div className="flex gap-3 mb-4">
                        <input
                          type="text"
                          value={topic.name}
                          onChange={(e) =>
                            updateTopic(index, "name", e.target.value)
                          }
                          placeholder="e.g., Binary Search Trees"
                          className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-indigo-600 focus:ring-4 focus:ring-indigo-100 transition-all outline-none text-gray-800"
                        />
                        {topics.length > 1 && (
                          <button
                            onClick={() => removeTopic(index)}
                            className="p-3 text-red-500 hover:bg-red-50 rounded-lg transition-all"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 mb-2">
                            Difficulty
                          </label>
                          <select
                            value={topic.difficulty}
                            onChange={(e) =>
                              updateTopic(index, "difficulty", e.target.value)
                            }
                            className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 outline-none text-gray-800"
                          >
                            <option value="easy">🟢 Easy</option>
                            <option value="medium">🟡 Medium</option>
                            <option value="hard">🔴 Hard</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-gray-600 mb-2">
                            Priority
                          </label>
                          <select
                            value={topic.priority}
                            onChange={(e) =>
                              updateTopic(index, "priority", e.target.value)
                            }
                            className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 outline-none text-gray-800"
                          >
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={addTopic}
                  className="w-full py-3 border-2 border-dashed border-indigo-300 rounded-xl text-indigo-600 font-semibold hover:bg-indigo-50 transition-all flex items-center justify-center gap-2"
                >
                  <Plus className="w-5 h-5" />
                  Add Another Topic
                </button>

                <div className="flex flex-col sm:flex-row gap-3 mt-8">
                  <button
                    onClick={() => setStep(1)}
                    className="flex-1 py-4 border-2 border-gray-300 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 transition-all flex items-center justify-center gap-2"
                  >
                    <ArrowLeft className="w-5 h-5" />
                    Back
                  </button>
                  <button
                    onClick={() => setStep(3)}
                    className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-4 rounded-xl font-semibold hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg flex items-center justify-center gap-2"
                  >
                    Continue to Availability
                    <ArrowRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Availability */}
            {step === 3 && (
              <div className="space-y-6 animate-fadeIn">
                <div className="text-center mb-8">
                  <h2 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">
                    When can you study?
                  </h2>
                  <p className="text-gray-600">Set your available time slots for each day</p>
                </div>

                <div className="space-y-4">
                  {[
                    "monday",
                    "tuesday",
                    "wednesday",
                    "thursday",
                    "friday",
                    "saturday",
                    "sunday",
                  ].map((day) => (
                    <div
                      key={day}
                      className="bg-gradient-to-r from-gray-50 to-purple-50 rounded-xl p-4 sm:p-6 border-2 border-gray-200"
                    >
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold text-gray-800 capitalize text-lg">
                          {day}
                        </h3>
                        <button
                          onClick={() => addTimeSlot(day)}
                          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all text-sm font-semibold flex items-center gap-2"
                        >
                          <Plus className="w-4 h-4" />
                          Add Slot
                        </button>
                      </div>

                      {availability[day].length === 0 ? (
                        <p className="text-gray-500 text-sm italic">
                          No time slots added
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {availability[day].map((slot, index) => (
                            <div key={index} className="flex flex-wrap items-center gap-2 sm:gap-3 bg-white p-3 rounded-lg">
                              <Clock className="w-4 h-4 text-indigo-600" />
                              <input
                                type="time"
                                value={slot.start}
                                onChange={(e) =>
                                  updateTimeSlot(
                                    day,
                                    index,
                                    "start",
                                    e.target.value
                                  )
                                }
                                className="px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 outline-none text-gray-800"
                              />
                              <span className="text-gray-500 font-medium">to</span>
                              <input
                                type="time"
                                value={slot.end}
                                onChange={(e) =>
                                  updateTimeSlot(
                                    day,
                                    index,
                                    "end",
                                    e.target.value
                                  )
                                }
                                className="px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 outline-none text-gray-800"
                              />
                              <button
                                onClick={() => removeTimeSlot(day, index)}
                                className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-all ml-auto"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex flex-col sm:flex-row gap-3 mt-8">
                  <button
                    onClick={() => setStep(2)}
                    className="flex-1 py-4 border-2 border-gray-300 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 transition-all flex items-center justify-center gap-2"
                  >
                    <ArrowLeft className="w-5 h-5" />
                    Back
                  </button>
                  <button
                    onClick={generateSchedule}
                    className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-4 rounded-xl font-semibold hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg flex items-center justify-center gap-2"
                  >
                    Generate Schedule
                    <TrendingUp className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}

            {/* Step 4: Schedule Display */}
            {step === 4 && schedule && (
              <div className="space-y-6 animate-fadeIn">
                {/* Header Card */}
                <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-6 sm:p-8 text-white">
                  <div className="flex items-start gap-4">
                    <div className="bg-white/20 p-4 rounded-xl">
                      <Calendar className="w-8 h-8" />
                    </div>
                    <div className="flex-1">
                      <h2 className="text-2xl sm:text-3xl font-bold mb-2">
                        Your Study Schedule
                      </h2>
                      <p className="text-indigo-100 mb-4">
                        {goal} • {goalType.charAt(0).toUpperCase() + goalType.slice(1)} •
                        Deadline: {new Date(deadline).toLocaleDateString()}
                      </p>
                      <div className="flex flex-wrap gap-4 text-sm sm:text-base">
                        <div className="bg-white/20 px-4 py-2 rounded-lg">
                          <span className="font-semibold">{getTotalStudyHours().toFixed(1)} hours</span> total
                        </div>
                        <div className="bg-white/20 px-4 py-2 rounded-lg">
                          <span className="font-semibold">{schedule.length} days</span> planned
                        </div>
                        <div className="bg-white/20 px-4 py-2 rounded-lg">
                          <span className="font-semibold">{sessionLength} min</span> sessions
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Schedule Cards */}
                <div className="grid gap-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                  {schedule.map((day, dayIndex) => (
                    <div
                      key={dayIndex}
                      className="bg-white border-2 border-gray-200 rounded-xl p-4 sm:p-6 hover:shadow-lg transition-all"
                    >
                      <h3 className="text-lg sm:text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <div className="w-2 h-2 bg-indigo-600 rounded-full"></div>
                        {day.day}, {day.date}
                      </h3>
                      <div className="space-y-3">
                        {day.sessions.map((session, sessionIndex) => (
                          <div
                            key={sessionIndex}
                            className={`p-4 rounded-lg border-l-4 ${
                              session.type === "revision"
                                ? "bg-amber-50 border-amber-500"
                                : session.difficulty === "hard"
                                ? "bg-red-50 border-red-500"
                                : session.difficulty === "medium"
                                ? "bg-yellow-50 border-yellow-500"
                                : "bg-green-50 border-green-500"
                            }`}
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-xl">
                                    {session.type === "revision" ? "🔄" : "📖"}
                                  </span>
                                  <span className="font-semibold text-gray-800">
                                    {session.topic}
                                  </span>
                                </div>
                                <p className="text-sm text-gray-600 flex items-center gap-3 flex-wrap">
                                  <span className="flex items-center gap-1">
                                    <Clock className="w-4 h-4" />
                                    {session.time}
                                  </span>
                                  <span className="bg-gray-200 px-2 py-1 rounded">
                                    {session.duration} min
                                  </span>
                                </p>
                              </div>
                              {session.difficulty === "hard" && (
                                <div className="flex items-center gap-2 bg-red-100 px-3 py-1 rounded-full text-sm">
                                  <AlertCircle className="w-4 h-4 text-red-600" />
                                  <span className="text-red-700 font-medium">High difficulty</span>
                                </div>
                              )}
                              {session.type === "revision" && (
                                <div className="bg-amber-100 px-3 py-1 rounded-full text-sm text-amber-700 font-medium">
                                  Revision Session
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pro Tips */}
                <div className="bg-gradient-to-r from-yellow-50 to-orange-50 border-2 border-yellow-200 rounded-xl p-6">
                  <h3 className="font-bold text-yellow-900 mb-3 flex items-center gap-2 text-lg">
                    💡 Pro Tips
                  </h3>
                  <div className="space-y-2">
                    {randomTips.map((tip, index) => (
                      <p key={index} className="text-sm text-yellow-800 flex items-start gap-2">
                        <span className="text-yellow-600 font-bold">•</span>
                        {tip}
                      </p>
                    ))}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={() => {
                      setStep(1);
                      setSchedule(null);
                    }}
                    className="flex-1 py-4 border-2 border-gray-300 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 transition-all"
                  >
                    Start New Plan
                  </button>
                  <button
                    onClick={exportScheduleToPDF}
                    className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-4 rounded-xl font-semibold hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg flex items-center justify-center gap-2"
                  >
                    <Download className="w-5 h-5" />
                    Download PDF
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* AI Assistant Button */}
      <button
        onClick={() => setShowChat(true)}
        className="fixed bottom-6 right-6 bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-4 rounded-full shadow-2xl hover:shadow-indigo-500/50 transition-all hover:scale-110 z-50 group"
      >
        <Sparkles className="w-6 h-6" />
        <span className="absolute right-full mr-3 bg-gray-900 text-white px-4 py-2 rounded-lg text-sm whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">
          AI Study Assistant
        </span>
      </button>

      {/* AI Chatbox Modal */}
      {showChat && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl h-[90vh] sm:h-[600px] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-4 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 p-2 rounded-lg">
                  <Sparkles className="w-5 h-5" />
                </div>
                <h2 className="text-xl font-bold">AI Study Assistant</h2>
              </div>
              <button
                onClick={() => setShowChat(false)}
                className="hover:bg-white/20 p-2 rounded-lg transition-all"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 bg-gradient-to-b from-gray-50 to-white">
              {messages.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="bg-gradient-to-r from-indigo-100 to-purple-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Sparkles className="w-10 h-10 text-indigo-600" />
                    </div>
                    <p className="text-xl font-bold text-gray-800 mb-2">
                      Hi! I'm your AI Study Assistant
                    </p>
                    <p className="text-gray-600">
                      Ask me about study tips, time management, or any
                      study-related questions!
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`flex ${
                        msg.type === "user" ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                          msg.type === "user"
                            ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white"
                            : "bg-white text-gray-800 border-2 border-gray-200 shadow-sm"
                        }`}
                      >
                        <div className={`prose prose-sm max-w-none ${msg.type === "user" ? "prose-invert" : ""}`}>
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  ))}
                  {loading && (
                    <div className="flex justify-start">
                      <div className="bg-white border-2 border-gray-200 rounded-2xl px-4 py-3">
                        <Loader2
                          className="animate-spin text-indigo-600"
                          size={20}
                        />
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Input */}
            <div className="border-t-2 border-gray-200 p-4 bg-white">
              <div className="flex gap-3">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Ask me anything about studying..."
                  className="flex-1 resize-none border-2 border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-600 transition-all text-gray-800"
                  rows="2"
                  disabled={loading}
                />
                <button
                  onClick={sendMessage}
                  disabled={loading || !input.trim()}
                  className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-3 rounded-xl hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center self-end shadow-lg"
                >
                  {loading ? (
                    <Loader2 className="animate-spin" size={20} />
                  ) : (
                    <Send size={20} />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-fadeIn {
          animation: fadeIn 0.5s ease-out;
        }

        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }

        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f5f9;
          border-radius: 10px;
        }

        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: linear-gradient(to bottom, #4f46e5, #9333ea);
          border-radius: 10px;
        }

        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(to bottom, #4338ca, #7e22ce);
        }
      `}</style>
    </div>
  );
};

export default StudyPlanner;
