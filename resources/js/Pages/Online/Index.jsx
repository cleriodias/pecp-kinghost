import AlertMessage from '@/Components/Alert/AlertMessage';
import Modal from '@/Components/Modal';
import PrimaryButton from '@/Components/Button/PrimaryButton';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import {
    formatRoleBadgeLabel,
    formatUnitBadgeLabel,
    getRoleBadgeStyle,
    getUnitBadgeStyle,
} from '@/Utils/brandBadges';
import { formatBrazilDateTime } from '@/Utils/date';
import { Head, usePage } from '@inertiajs/react';
import axios from 'axios';
import { useEffect, useMemo, useRef, useState } from 'react';

const COLOR_OPTIONS = [
    { label: 'Azul', value: '#2563eb' },
    { label: 'Verde', value: '#059669' },
    { label: 'Vermelho', value: '#dc2626' },
    { label: 'Laranja', value: '#ea580c' },
    { label: 'Roxo', value: '#7c3aed' },
    { label: 'Cinza', value: '#475569' },
];

const escapeHtml = (value) =>
    String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

const replaceSimpleTag = (value, tag, openTag, closeTag) =>
    value.replace(
        new RegExp(`\\[${tag}\\]([\\s\\S]*?)\\[\\/${tag}\\]`, 'gi'),
        `${openTag}$1${closeTag}`,
    );

const replaceColorTag = (value) =>
    value.replace(/\[color=([#a-zA-Z0-9]+)\]([\s\S]*?)\[\/color\]/gi, (match, color, content) => {
        const normalized = String(color ?? '').trim().toLowerCase();
        const allowed = COLOR_OPTIONS.map((option) => option.value.toLowerCase());

        if (!allowed.includes(normalized)) {
            return content;
        }

        return `<span style="color:${normalized}">${content}</span>`;
    });

const buildAnchorTag = (href, content) => {
    const normalizedHref = String(href ?? '').trim();
    const isInternalLink = normalizedHref.startsWith('/');
    const isExternalLink = /^https?:\/\//i.test(normalizedHref);

    if (!isInternalLink && !isExternalLink) {
        return content;
    }

    const extraAttributes = isExternalLink ? ' target="_blank" rel="noopener noreferrer"' : '';

    return `<a href="${normalizedHref}" class="font-semibold text-blue-600 underline underline-offset-2"${extraAttributes}>${content}</a>`;
};

const replaceLinkTag = (value) =>
    value.replace(/\[link=([^\]]+)\]([\s\S]*?)\[\/link\]/gi, (match, href, content) => {
        return buildAnchorTag(href, content);
    });

const replaceAutoLinks = (value) => {
    let formatted = value.replace(/(^|[\s>])((https?:\/\/[^\s<]+))/gi, (match, prefix, url) => {
        return `${prefix}${buildAnchorTag(url, url)}`;
    });

    formatted = formatted.replace(
        /(^|[\s>])((\/[a-zA-Z0-9\-._~/?#[\]@!$&'()*+,;=%]+))/gi,
        (match, prefix, path) => `${prefix}${buildAnchorTag(path, path)}`,
    );

    return formatted;
};

const renderMessage = (value) => {
    let formatted = escapeHtml(value);

    for (let index = 0; index < 4; index += 1) {
        const previous = formatted;
        formatted = replaceSimpleTag(formatted, 'b', '<strong>', '</strong>');
        formatted = replaceSimpleTag(formatted, 'i', '<em>', '</em>');
        formatted = replaceSimpleTag(formatted, 'u', '<u>', '</u>');
        formatted = replaceColorTag(formatted);
        formatted = replaceLinkTag(formatted);
        formatted = replaceAutoLinks(formatted);

        if (formatted === previous) {
            break;
        }
    }

    return formatted.replace(/\r?\n/g, '<br />');
};

const resolveErrorMessage = (error, fallback) => {
    if (error?.response?.data?.errors) {
        const first = Object.values(error.response.data.errors).flat()[0];
        if (first) {
            return String(first);
        }
    }

    if (error?.response?.data?.message) {
        return String(error.response.data.message);
    }

    if (error?.message) {
        return String(error.message);
    }

    return fallback;
};

const resolveDraftKey = (userId) => String(userId ?? '');

const canManageMessage = (message) => Boolean(message?.is_mine && message?.can_manage);

const formatMessageFooterMeta = (value) => {
    if (!value) {
        return {
            date: '--',
            time: '--:--',
        };
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return {
            date: '--',
            time: '--:--',
        };
    }

    return {
        date: date.toLocaleDateString('pt-BR'),
        time: date.toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
        }),
    };
};

const COMPACT_BADGE_CLASSNAME =
    'inline-flex shrink-0 items-center justify-center rounded-full border font-semibold uppercase tracking-wide whitespace-nowrap';

const ANYDESCK_TYPE_OPTIONS = [
    { label: 'Maquina do Caixa', value: 'Caixa' },
    { label: 'Maquina da Lanchonete', value: 'Lanchonete' },
];

const ANYDESCK_ROLE_TYPE_MAP = {
    3: 'Caixa',
    4: 'Lanchonete',
};

const applyAnyDeskCodeMask = (value) => {
    const digits = String(value ?? '').replace(/\D/g, '').slice(0, 10);
    const groups = [];

    if (digits.length > 0) {
        groups.push(digits.slice(0, 1));
    }

    if (digits.length > 1) {
        groups.push(digits.slice(1, 4));
    }

    if (digits.length > 4) {
        groups.push(digits.slice(4, 7));
    }

    if (digits.length > 7) {
        groups.push(digits.slice(7, 10));
    }

    return groups.join(' ');
};

export default function OnlineIndex({
    onlineUsers: initialOnlineUsers = [],
    offlineUsers: initialOfflineUsers = [],
    selectedUserId: initialSelectedUserId = null,
    messages: initialMessages = [],
    currentUser = null,
}) {
    const { flash } = usePage().props;
    const [onlineUsers, setOnlineUsers] = useState(initialOnlineUsers);
    const [offlineUsers, setOfflineUsers] = useState(initialOfflineUsers);
    const [selectedUserId, setSelectedUserId] = useState(initialSelectedUserId);
    const [messages, setMessages] = useState(initialMessages);
    const [currentViewer, setCurrentViewer] = useState(currentUser);
    const [draftMessages, setDraftMessages] = useState({});
    const [loadingSnapshot, setLoadingSnapshot] = useState(false);
    const [refreshingSnapshot, setRefreshingSnapshot] = useState(false);
    const [sendingMessage, setSendingMessage] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [editingMessageId, setEditingMessageId] = useState(null);
    const [editDraftMessage, setEditDraftMessage] = useState('');
    const [savingEditMessage, setSavingEditMessage] = useState(false);
    const [deletingMessage, setDeletingMessage] = useState(false);
    const [editErrorMessage, setEditErrorMessage] = useState('');
    const [showAnyDeskModal, setShowAnyDeskModal] = useState(false);
    const [selectedAnyDeskType, setSelectedAnyDeskType] = useState('');
    const [anyDeskData, setAnyDeskData] = useState(null);
    const [anyDeskCodeDraft, setAnyDeskCodeDraft] = useState('');
    const [loadingAnyDesk, setLoadingAnyDesk] = useState(false);
    const [savingAnyDesk, setSavingAnyDesk] = useState(false);
    const [sendingAnyDesk, setSendingAnyDesk] = useState(false);
    const [anyDeskErrorMessage, setAnyDeskErrorMessage] = useState('');
    const textareaRef = useRef(null);
    const editTextareaRef = useRef(null);
    const messagesEndRef = useRef(null);
    const messagesContainerRef = useRef(null);
    const selectedUserIdRef = useRef(initialSelectedUserId);
    const hasInitialConversationScrollRef = useRef(false);

    const sortedContacts = useMemo(() => {
        const toTimestamp = (value) => {
            if (!value) {
                return 0;
            }

            const date = new Date(value);

            return Number.isNaN(date.getTime()) ? 0 : date.getTime();
        };

        const getUnreadRank = (user) => (Number(user.unread_count ?? 0) > 0 ? 1 : 0);
        const getAvailabilityRank = (user) => (user.is_online ? 1 : 0);

        return [...onlineUsers, ...offlineUsers].sort((left, right) => {
            const leftUnreadRank = getUnreadRank(left);
            const rightUnreadRank = getUnreadRank(right);

            if (leftUnreadRank !== rightUnreadRank) {
                return rightUnreadRank - leftUnreadRank;
            }

            const leftTimestamp = toTimestamp(left.last_message_at);
            const rightTimestamp = toTimestamp(right.last_message_at);

            if (leftTimestamp !== rightTimestamp) {
                return rightTimestamp - leftTimestamp;
            }

            const leftAvailabilityRank = getAvailabilityRank(left);
            const rightAvailabilityRank = getAvailabilityRank(right);

            if (leftAvailabilityRank !== rightAvailabilityRank) {
                return rightAvailabilityRank - leftAvailabilityRank;
            }

            return String(left.name ?? '').localeCompare(String(right.name ?? ''), 'pt-BR');
        });
    }, [onlineUsers, offlineUsers]);

    const selectedUser = useMemo(
        () =>
            sortedContacts.find((user) => Number(user.id) === Number(selectedUserId)) ??
            sortedContacts[0] ??
            null,
        [sortedContacts, selectedUserId],
    );

    const editingMessage = useMemo(
        () =>
            messages.find((message) => Number(message.id) === Number(editingMessageId)) ?? null,
        [messages, editingMessageId],
    );

    const editingMessageCanBeManaged = useMemo(
        () => canManageMessage(editingMessage),
        [editingMessage],
    );

    const draftMessage = useMemo(
        () => draftMessages[resolveDraftKey(selectedUserId)] ?? '',
        [draftMessages, selectedUserId],
    );

    const fixedAnyDeskType = useMemo(
        () => ANYDESCK_ROLE_TYPE_MAP[Number(currentViewer?.role ?? -1)] ?? '',
        [currentViewer],
    );

    const anyDeskNeedsTypeSelection = !fixedAnyDeskType;

    useEffect(() => {
        selectedUserIdRef.current = selectedUserId;
    }, [selectedUserId]);

    useEffect(() => {
        if (hasInitialConversationScrollRef.current || !selectedUser) {
            return;
        }

        hasInitialConversationScrollRef.current = true;
        window.requestAnimationFrame(() => {
            messagesEndRef.current?.scrollIntoView({
                behavior: 'auto',
            });
        });
    }, [selectedUser]);

    useEffect(() => {
        if (selectedUser) {
            textareaRef.current?.focus();
        }
        setErrorMessage('');
    }, [selectedUser?.id]);

    useEffect(() => {
        if (editingMessageId) {
            window.requestAnimationFrame(() => {
                editTextareaRef.current?.focus();
            });
        }
    }, [editingMessageId]);

    const applySnapshot = (payload, requestedUserId = null, shouldAutoScroll = false) => {
        const nextUsers = Array.isArray(payload?.onlineUsers) ? payload.onlineUsers : [];
        const nextOfflineUsers = Array.isArray(payload?.offlineUsers) ? payload.offlineUsers : [];
        const availableIds = nextUsers
            .map((user) => Number(user.id))
            .concat(nextOfflineUsers.map((user) => Number(user.id)));
        const nextSelectedUserId =
            requestedUserId && availableIds.includes(Number(requestedUserId))
                ? Number(requestedUserId)
                : payload?.selectedUserId && availableIds.includes(Number(payload.selectedUserId))
                  ? Number(payload.selectedUserId)
                  : nextUsers[0]?.id ?? nextOfflineUsers[0]?.id ?? null;
        const currentSelectedUserId = Number(selectedUserIdRef.current ?? 0);
        const nextSelectedUserIdNumber = Number(nextSelectedUserId ?? 0);
        const selectedConversationChanged = currentSelectedUserId !== nextSelectedUserIdNumber;

        setOnlineUsers(nextUsers);
        setOfflineUsers(nextOfflineUsers);
        setSelectedUserId(nextSelectedUserId);
        setMessages(Array.isArray(payload?.messages) ? payload.messages : []);
        if (payload?.currentUser) {
            setCurrentViewer(payload.currentUser);
        }

        if ((shouldAutoScroll || selectedConversationChanged) && nextSelectedUserId) {
            window.requestAnimationFrame(() => {
                messagesEndRef.current?.scrollIntoView({
                    behavior: 'auto',
                });
            });
        }
    };

    const loadSnapshot = async (requestedUserId = null, silent = false, shouldAutoScroll = false) => {
        if (!silent) {
            setLoadingSnapshot(true);
        } else {
            setRefreshingSnapshot(true);
        }

        try {
            const response = await axios.get(route('online.snapshot'), {
                params: requestedUserId ? { selected_user_id: requestedUserId } : {},
            });

            applySnapshot(response.data ?? {}, requestedUserId, shouldAutoScroll);
            setErrorMessage('');
        } catch (error) {
            if (!silent) {
                setErrorMessage(resolveErrorMessage(error, 'Nao foi possivel atualizar a lista de usuarios on-line.'));
            }
        } finally {
            if (!silent) {
                setLoadingSnapshot(false);
            } else {
                setRefreshingSnapshot(false);
            }
        }
    };

    useEffect(() => {
        const intervalId = window.setInterval(() => {
            loadSnapshot(selectedUserIdRef.current, true);
        }, 15000);

        return () => {
            window.clearInterval(intervalId);
        };
    }, []);

    const wrapSelection = (prefix, suffix = prefix) => {
        const textarea = textareaRef.current;
        if (!textarea) {
            setDraftMessages((current) => {
                const draftKey = resolveDraftKey(selectedUserId);
                const currentMessage = current[draftKey] ?? '';

                return {
                    ...current,
                    [draftKey]: `${currentMessage}${prefix}${suffix}`,
                };
            });
            return;
        }

        const start = textarea.selectionStart ?? 0;
        const end = textarea.selectionEnd ?? 0;
        const selected = draftMessage.slice(start, end);
        const nextValue =
            draftMessage.slice(0, start) +
            prefix +
            selected +
            suffix +
            draftMessage.slice(end);

        setDraftMessages((current) => ({
            ...current,
            [resolveDraftKey(selectedUserId)]: nextValue,
        }));

        window.requestAnimationFrame(() => {
            textarea.focus();
            textarea.setSelectionRange(start + prefix.length, end + prefix.length);
        });
    };

    const handleSelectUser = (userId) => {
        setSelectedUserId(userId);
        loadSnapshot(userId, false, true);
    };

    const closeAnyDeskModal = () => {
        if (savingAnyDesk || sendingAnyDesk) {
            return;
        }

        setShowAnyDeskModal(false);
        setSelectedAnyDeskType(fixedAnyDeskType || '');
        setAnyDeskData(null);
        setAnyDeskCodeDraft('');
        setAnyDeskErrorMessage('');
    };

    const loadAnyDesk = async (type) => {
        if (!type) {
            setAnyDeskData(null);
            setAnyDeskCodeDraft('');
            return;
        }

        setLoadingAnyDesk(true);

        try {
            const response = await axios.get(route('online.anydesck.show'), {
                params: { type },
            });
            const payload = response.data ?? null;

            setAnyDeskData(payload);
            setAnyDeskCodeDraft(applyAnyDeskCodeMask(payload?.code ?? ''));
            setAnyDeskErrorMessage('');
        } catch (error) {
            setAnyDeskData(null);
            setAnyDeskCodeDraft('');
            setAnyDeskErrorMessage(resolveErrorMessage(error, 'Nao foi possivel carregar o codigo AnyDesk.'));
        } finally {
            setLoadingAnyDesk(false);
        }
    };

    const openAnyDeskModal = async () => {
        const nextType = fixedAnyDeskType || '';

        setShowAnyDeskModal(true);
        setSelectedAnyDeskType(nextType);
        setAnyDeskData(null);
        setAnyDeskCodeDraft('');
        setAnyDeskErrorMessage('');

        if (nextType) {
            await loadAnyDesk(nextType);
        }
    };

    const handleSelectAnyDeskType = async (type) => {
        setSelectedAnyDeskType(type);
        setAnyDeskData(null);
        setAnyDeskCodeDraft('');
        setAnyDeskErrorMessage('');
        await loadAnyDesk(type);
    };

    const persistAnyDesk = async (type, code) => {
        const response = await axios.put(route('online.anydesck.update'), {
            type,
            code,
        });
        const payload = response.data ?? null;

        setAnyDeskData(payload);
        setAnyDeskCodeDraft(applyAnyDeskCodeMask(payload?.code ?? code));

        return payload;
    };

    const handleSaveAnyDesk = async (event) => {
        event.preventDefault();

        if (!selectedAnyDeskType) {
            setAnyDeskErrorMessage('Selecione se voce esta na maquina do Caixa ou da Lanchonete.');
            return;
        }

        if (!anyDeskCodeDraft.trim()) {
            setAnyDeskErrorMessage('Informe o codigo AnyDesk antes de salvar.');
            return;
        }

        setSavingAnyDesk(true);

        try {
            await persistAnyDesk(selectedAnyDeskType, anyDeskCodeDraft);
            setAnyDeskErrorMessage('');
        } catch (error) {
            setAnyDeskErrorMessage(resolveErrorMessage(error, 'Nao foi possivel atualizar o codigo AnyDesk.'));
        } finally {
            setSavingAnyDesk(false);
        }
    };

    const handleSendAnyDesk = async () => {
        if (!selectedUser) {
            setAnyDeskErrorMessage('Selecione um usuario no bate-papo antes de enviar o AnyDesk.');
            return;
        }

        if (!selectedAnyDeskType) {
            setAnyDeskErrorMessage('Selecione se voce esta na maquina do Caixa ou da Lanchonete.');
            return;
        }

        if (!anyDeskCodeDraft.trim()) {
            setAnyDeskErrorMessage('Informe o codigo AnyDesk antes de enviar.');
            return;
        }

        setSendingAnyDesk(true);

        try {
            const payload = await persistAnyDesk(selectedAnyDeskType, anyDeskCodeDraft);
            const message = `Codigo AnyDesk (${payload?.type ?? selectedAnyDeskType} - ${payload?.unit_name ?? currentViewer?.unit_name ?? 'Sem loja'}): ${payload?.code ?? anyDeskCodeDraft}`;
            const response = await axios.post(route('online.messages.store'), {
                recipient_user_id: selectedUser.id,
                message,
            });

            applySnapshot(response.data ?? {}, selectedUser.id);
            setAnyDeskErrorMessage('');
            closeAnyDeskModal();
        } catch (error) {
            setAnyDeskErrorMessage(resolveErrorMessage(error, 'Nao foi possivel enviar o codigo AnyDesk pelo bate-papo.'));
        } finally {
            setSendingAnyDesk(false);
        }
    };

    const submitMessage = async () => {
        if (!selectedUser || sendingMessage) {
            return;
        }

        const message = draftMessage.trim();
        if (!message) {
            setErrorMessage('Digite uma mensagem antes de enviar.');
            return;
        }

        setSendingMessage(true);

        try {
            const response = await axios.post(route('online.messages.store'), {
                recipient_user_id: selectedUser.id,
                message,
            });

            applySnapshot(response.data ?? {}, selectedUser.id);
            setDraftMessages((current) => ({
                ...current,
                [resolveDraftKey(selectedUser.id)]: '',
            }));
            setErrorMessage('');
            textareaRef.current?.focus();
        } catch (error) {
            setErrorMessage(resolveErrorMessage(error, 'Nao foi possivel enviar a mensagem.'));
        } finally {
            setSendingMessage(false);
        }
    };

    const handleSendMessage = async (event) => {
        event.preventDefault();
        await submitMessage();
    };

    const openEditModal = (message) => {
        if (!canManageMessage(message)) {
            return;
        }

        setEditingMessageId(message.id);
        setEditDraftMessage(String(message.message ?? ''));
        setEditErrorMessage('');
    };

    const closeEditModal = () => {
        if (savingEditMessage || deletingMessage) {
            return;
        }

        setEditingMessageId(null);
        setEditDraftMessage('');
        setEditErrorMessage('');
    };

    const handleUpdateMessage = async (event) => {
        event.preventDefault();

        if (!editingMessage || !editingMessageCanBeManaged || savingEditMessage || deletingMessage) {
            return;
        }

        const nextMessage = editDraftMessage.trim();
        if (!nextMessage) {
            setEditErrorMessage('Digite uma mensagem antes de salvar.');
            return;
        }

        setSavingEditMessage(true);

        try {
            const response = await axios.put(route('online.messages.update', editingMessage.id), {
                message: nextMessage,
            });

            applySnapshot(response.data ?? {}, selectedUserIdRef.current);
            setEditingMessageId(null);
            setEditDraftMessage('');
            setEditErrorMessage('');
            setErrorMessage('');
        } catch (error) {
            setEditErrorMessage(resolveErrorMessage(error, 'Nao foi possivel atualizar a mensagem.'));
        } finally {
            setSavingEditMessage(false);
        }
    };

    const handleDeleteMessage = async () => {
        if (!editingMessage || !editingMessageCanBeManaged || savingEditMessage || deletingMessage) {
            return;
        }

        setDeletingMessage(true);

        try {
            const response = await axios.delete(route('online.messages.destroy', editingMessage.id));

            applySnapshot(response.data ?? {}, selectedUserIdRef.current);
            setEditingMessageId(null);
            setEditDraftMessage('');
            setEditErrorMessage('');
            setErrorMessage('');
        } catch (error) {
            setEditErrorMessage(resolveErrorMessage(error, 'Nao foi possivel excluir a mensagem.'));
        } finally {
            setDeletingMessage(false);
        }
    };

    const renderContactButton = (user, offline = false) => {
        const isSelected = Number(user.id) === Number(selectedUser?.id);
        const hasUnread = Number(user.unread_count ?? 0) > 0;
        const preview = String(user.last_message_preview ?? '').trim() || 'Sem mensagens recentes.';
        const lastMessageAt = user.last_message_at ? formatBrazilDateTime(user.last_message_at) : '--';

        return (
            <button
                type="button"
                key={`${offline ? 'offline' : 'online'}-${user.id}`}
                onClick={() => handleSelectUser(user.id)}
                className={`group mx-3 my-2 flex w-[calc(100%-1.5rem)] flex-col gap-3 rounded-2xl border px-4 py-4 text-left shadow-sm transition ${
                    isSelected
                        ? hasUnread
                            ? 'border-emerald-200 bg-emerald-50 shadow-md ring-1 ring-emerald-200 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:ring-emerald-500/20'
                            : 'border-slate-200 bg-slate-50 shadow-md ring-1 ring-slate-200 dark:border-slate-600 dark:bg-slate-800/80 dark:ring-slate-600/40'
                        : hasUnread
                          ? 'border-emerald-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/80 dark:border-emerald-500/20 dark:bg-gray-900 dark:hover:border-emerald-500/40 dark:hover:bg-emerald-500/10'
                          : offline
                            ? 'border-gray-200 bg-gray-50/90 hover:border-gray-300 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900/60 dark:hover:bg-gray-800/70'
                            : 'border-gray-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800/70'
                }`}
            >
                <div className="flex w-full items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                            <span className="inline-flex items-center rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-black shadow-sm">
                                <span className="max-w-[148px] truncate">
                                    {String(user.name ?? '').toUpperCase()}
                                </span>
                            </span>
                            {!offline && (
                                <span className="inline-flex h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.15)]" />
                            )}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span
                                className={COMPACT_BADGE_CLASSNAME}
                                style={{
                                    ...getRoleBadgeStyle(user.original_role_label ?? user.role_label),
                                    padding: '2px 8px',
                                    fontSize: '10px',
                                    lineHeight: '14px',
                                    minHeight: '20px',
                                }}
                            >
                                {formatRoleBadgeLabel(user.original_role_label ?? user.role_label)}
                            </span>
                            <span
                                className={COMPACT_BADGE_CLASSNAME}
                                style={{
                                    ...getUnitBadgeStyle(user.unit_name),
                                    padding: '2px 8px',
                                    fontSize: '10px',
                                    lineHeight: '14px',
                                    minHeight: '20px',
                                }}
                            >
                                {formatUnitBadgeLabel(user.unit_name)}
                            </span>
                            {offline && (
                                <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                    Offline
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-2">
                        <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
                            {lastMessageAt}
                        </span>
                        {hasUnread ? (
                            <span className="inline-flex min-w-[24px] items-center justify-center rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white shadow-sm">
                                {user.unread_count}
                            </span>
                        ) : (
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 text-slate-300 dark:border-slate-700 dark:text-slate-600">
                                <i className="bi bi-chat-left-text text-[11px]" aria-hidden="true"></i>
                            </span>
                        )}
                    </div>
                </div>

                <div className="rounded-2xl bg-slate-50 px-3 py-2 text-sm leading-5 text-slate-600 transition group-hover:bg-white/80 dark:bg-slate-800/70 dark:text-slate-300 dark:group-hover:bg-slate-800">
                    <p className="line-clamp-2 break-words">{preview}</p>
                </div>
            </button>
        );
    };

    return (
        <AuthenticatedLayout
            header={(
                <div className="flex flex-col gap-1">
                    <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Usuarios On-Line</h2>
                </div>
            )}
        >
            <Head title="On-Line" />

            <div className="py-8">
                <div className="mx-auto max-w-7xl space-y-6 px-4 sm:px-6 lg:px-8">
                    <AlertMessage message={flash} />

                    {errorMessage && (
                        <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600 shadow-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
                            {errorMessage}
                        </div>
                    )}

                    <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
                        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
                            <div className="border-b border-gray-200 px-4 py-4 dark:border-gray-700">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-300">Central de CHATS</p>
                                        <h3 className="text-2xl font-semibold tracking-tight text-gray-800 dark:text-gray-100">
                                            {sortedContacts.length} chats(s)
                                        </h3>
                                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                                            Mensagens Internas.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => loadSnapshot(selectedUserIdRef.current)}
                                        disabled={loadingSnapshot || refreshingSnapshot}
                                        title={loadingSnapshot || refreshingSnapshot ? 'Atualizando conversas' : 'Atualizar conversas'}
                                        aria-label={loadingSnapshot || refreshingSnapshot ? 'Atualizando conversas' : 'Atualizar conversas'}
                                        className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-700 transition hover:border-indigo-400 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-70 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
                                    >
                                        <i
                                            className={`bi ${loadingSnapshot || refreshingSnapshot ? 'bi-arrow-repeat animate-spin' : 'bi-arrow-clockwise'} text-lg`}
                                            aria-hidden="true"
                                        ></i>
                                        <span className="sr-only">
                                            {loadingSnapshot || refreshingSnapshot ? 'Atualizando conversas' : 'Atualizar conversas'}
                                        </span>
                                    </button>
                                </div>
                            </div>

                            <div className="max-h-[68vh] overflow-y-auto bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_18%)] dark:bg-[linear-gradient(180deg,#111827_0%,#0f172a_18%)]">
                                {sortedContacts.length === 0 ? (
                                    <div className="px-4 py-6 text-sm text-gray-500 dark:text-gray-400">
                                        Nenhuma conversa disponivel neste momento.
                                    </div>
                                ) : (
                                    sortedContacts.map((user) => renderContactButton(user, !user.is_online))
                                )}
                            </div>
                        </div>

                        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
                            <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-700">
                                {selectedUser ? (
                                    <div className="flex flex-col gap-1">
                                        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                                            {selectedUser.name}
                                        </h3>
                                        <p className="text-sm text-gray-500 dark:text-gray-300">
                                            {selectedUser.original_role_label ?? selectedUser.role_label} | Loja: {selectedUser.unit_name ?? '---'}
                                        </p>
                                    </div>
                                ) : (
                                    <div>
                                        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                                            Conversa
                                        </h3>
                                        <p className="text-sm text-gray-500 dark:text-gray-300">
                                            Selecione um usuario on-line para iniciar.
                                        </p>
                                    </div>
                                )}
                            </div>

                            <div className="flex h-[68vh] min-h-0 flex-col">
                                <div
                                    ref={messagesContainerRef}
                                    className="flex-1 space-y-3 overflow-y-auto px-5 py-5"
                                >
                                    {selectedUser ? (
                                        messages.length === 0 ? (
                                            <div className="rounded-2xl border border-dashed border-gray-300 px-4 py-6 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                                                Nenhuma mensagem ainda. Use a caixa abaixo para iniciar a conversa.
                                            </div>
                                        ) : (
                                            messages.map((message) => (
                                                <div
                                                    key={message.id}
                                                    className={`flex ${message.is_mine ? 'justify-end' : 'justify-start'}`}
                                                >
                                                    <div
                                                        onClick={canManageMessage(message) ? () => openEditModal(message) : undefined}
                                                        className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm ${
                                                            canManageMessage(message)
                                                                ? 'cursor-pointer bg-slate-300 text-slate-800 transition hover:bg-slate-400 dark:bg-slate-600 dark:text-slate-100 dark:hover:bg-slate-500'
                                                                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-100'
                                                        }`}
                                                        title={canManageMessage(message) ? 'Clique para editar sua mensagem' : undefined}
                                                    >
                                                        <div
                                                            className={`mb-2 text-[11px] font-semibold uppercase ${
                                                                message.is_mine
                                                                    ? ''
                                                                    : 'text-slate-500 dark:text-slate-400'
                                                            }`}
                                                            style={message.is_mine ? { color: '#475569' } : undefined}
                                                        >
                                                            {String(message.sender_name ?? '---').toUpperCase()} - {message.sender_original_role_label ?? message.sender_role_label}
                                                        </div>
                                                        <div
                                                            className="prose prose-sm max-w-none text-inherit prose-p:my-0 prose-strong:text-inherit prose-em:text-inherit prose-u:text-inherit"
                                                            dangerouslySetInnerHTML={{
                                                                __html: renderMessage(message.message),
                                                            }}
                                                        />
                                                        <div className="mt-2 flex justify-end">
                                                            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-300">
                                                                {formatMessageFooterMeta(message.sent_at).date}
                                                            </span>
                                                            <span className="ml-2 text-[11px] font-semibold text-slate-500 dark:text-slate-300">
                                                                {formatMessageFooterMeta(message.sent_at).time}
                                                            </span>
                                                            {message.is_mine && (
                                                                <span
                                                                    className="ml-2 text-[11px] font-bold tracking-[-0.18em]"
                                                                    style={{
                                                                        color: message.read_at ? '#38bdf8' : '#e2e8f0',
                                                                    }}
                                                                    title={message.read_at ? 'Mensagem lida' : 'Mensagem entregue'}
                                                                >
                                                                    {'\u2713\u2713'}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))
                                        )
                                    ) : (
                                        <div className="rounded-2xl border border-dashed border-gray-300 px-4 py-6 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                                            Nenhum usuario visivel on-line para este perfil neste momento.
                                        </div>
                                    )}
                                    <div ref={messagesEndRef}></div>
                                </div>

                                <div className="border-t border-gray-200 px-5 py-4 dark:border-gray-700">
                                    <div className="mb-3 flex flex-wrap items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => wrapSelection('[b]', '[/b]')}
                                            className="rounded-full border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 transition hover:border-indigo-400 hover:text-indigo-600 dark:border-gray-600 dark:text-gray-200"
                                        >
                                            Negrito
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => wrapSelection('[i]', '[/i]')}
                                            className="rounded-full border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 transition hover:border-indigo-400 hover:text-indigo-600 dark:border-gray-600 dark:text-gray-200"
                                        >
                                            Italico
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => wrapSelection('[u]', '[/u]')}
                                            className="rounded-full border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 transition hover:border-indigo-400 hover:text-indigo-600 dark:border-gray-600 dark:text-gray-200"
                                        >
                                            Sublinhado
                                        </button>
                                        {COLOR_OPTIONS.map((option) => (
                                            <button
                                                type="button"
                                                key={option.value}
                                                onClick={() => wrapSelection(`[color=${option.value}]`, '[/color]')}
                                                className="inline-flex items-center gap-2 rounded-full border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 transition hover:border-indigo-400 hover:text-indigo-600 dark:border-gray-600 dark:text-gray-200"
                                            >
                                                <span
                                                    className="h-3 w-3 rounded-full"
                                                    style={{ backgroundColor: option.value }}
                                                ></span>
                                                {option.label}
                                            </button>
                                        ))}
                                    </div>

                                    <form onSubmit={handleSendMessage} className="space-y-3">
                                        <textarea
                                            ref={textareaRef}
                                            rows={4}
                                            value={draftMessage}
                                            onChange={(event) =>
                                                setDraftMessages((current) => ({
                                                    ...current,
                                                    [resolveDraftKey(selectedUserId)]: event.target.value,
                                                }))
                                            }
                                            placeholder={
                                                selectedUser
                                                    ? 'Digite sua mensagem. As marcacoes simples sao mantidas.'
                                                    : 'Selecione um usuario on-line para conversar.'
                                            }
                                            disabled={!selectedUser || sendingMessage}
                                            className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm text-gray-800 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:disabled:bg-gray-900"
                                        />
                                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                                `Enter` quebra linha. Use o botao para enviar. Clique na sua mensagem ainda nao lida para editar.
                                            </p>
                                            <div className="flex items-center gap-2 self-end">
                                                <PrimaryButton
                                                    type="button"
                                                    onClick={openAnyDeskModal}
                                                    disabled={loadingAnyDesk || savingAnyDesk || sendingAnyDesk}
                                                    className="rounded-2xl px-5 py-2 normal-case tracking-normal"
                                                >
                                                    AnyDesk
                                                </PrimaryButton>
                                                <PrimaryButton
                                                    type="submit"
                                                    disabled={!selectedUser || sendingMessage}
                                                    className="rounded-2xl px-5 py-2 normal-case tracking-normal"
                                                >
                                                    {sendingMessage ? 'Enviando...' : 'Enviar'}
                                                </PrimaryButton>
                                            </div>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <Modal show={Boolean(editingMessage)} onClose={closeEditModal} maxWidth="xl" tone="light">
                <form onSubmit={handleUpdateMessage} className="space-y-4 p-6">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900">Editar mensagem</h3>
                        <p className="mt-1 text-sm text-gray-500">
                            Ajuste ou exclua a mensagem enquanto ela ainda nao foi lida.
                        </p>
                    </div>

                    {editErrorMessage && (
                        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                            {editErrorMessage}
                        </div>
                    )}

                    {!editingMessageCanBeManaged && (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                            Essa mensagem ja foi lida e nao pode mais ser editada ou excluida.
                        </div>
                    )}

                    <textarea
                        ref={editTextareaRef}
                        rows={6}
                        value={editDraftMessage}
                        onChange={(event) => setEditDraftMessage(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' && !event.shiftKey) {
                                event.stopPropagation();
                            }
                        }}
                        disabled={!editingMessageCanBeManaged || savingEditMessage || deletingMessage}
                        className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm text-gray-800 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    />

                    <div className="flex items-center justify-end gap-3">
                        <button
                            type="button"
                            onClick={closeEditModal}
                            disabled={savingEditMessage || deletingMessage}
                            className="rounded-full border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:border-indigo-400 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            Cancelar
                        </button>
                        {editingMessageCanBeManaged && (
                            <button
                                type="button"
                                onClick={handleDeleteMessage}
                                disabled={savingEditMessage || deletingMessage}
                                className="rounded-full border border-red-300 px-4 py-2 text-sm font-semibold text-red-600 transition hover:border-red-400 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {deletingMessage ? 'Excluindo...' : 'Excluir'}
                            </button>
                        )}
                        <button
                            type="submit"
                            disabled={!editingMessageCanBeManaged || savingEditMessage || deletingMessage}
                            className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {savingEditMessage ? 'Salvando...' : 'Salvar'}
                        </button>
                    </div>
                </form>
            </Modal>

            <Modal show={showAnyDeskModal} onClose={closeAnyDeskModal} maxWidth="lg" tone="light">
                <form onSubmit={handleSaveAnyDesk} className="space-y-4 p-6">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900">AnyDesk</h3>
                        <p className="mt-1 text-sm text-gray-500">
                            Consulte, atualize e envie o codigo da maquina da sua loja ativa.
                        </p>
                    </div>

                    {anyDeskNeedsTypeSelection && (
                        <div className="space-y-2">
                            <p className="text-sm font-semibold text-gray-700">Onde voce esta?</p>
                            <div className="flex flex-wrap gap-2">
                                {ANYDESCK_TYPE_OPTIONS.map((option) => {
                                    const isActive = selectedAnyDeskType === option.value;

                                    return (
                                        <button
                                            key={option.value}
                                            type="button"
                                            onClick={() => handleSelectAnyDeskType(option.value)}
                                            className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                                                isActive
                                                    ? 'border-blue-500 bg-blue-500 text-white'
                                                    : 'border-gray-300 bg-white text-gray-700 hover:border-blue-400 hover:text-blue-600'
                                            }`}
                                        >
                                            {option.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    <div className="grid gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 sm:grid-cols-3">
                        <div>
                            <p className="text-xs font-semibold uppercase text-gray-500">Perfil</p>
                            <p className="mt-1 font-semibold">{anyDeskData?.role_label ?? currentViewer?.role_label ?? '---'}</p>
                        </div>
                        <div>
                            <p className="text-xs font-semibold uppercase text-gray-500">Loja</p>
                            <p className="mt-1 font-semibold">{anyDeskData?.unit_name ?? currentViewer?.unit_name ?? '---'}</p>
                        </div>
                        <div>
                            <p className="text-xs font-semibold uppercase text-gray-500">Tipo</p>
                            <p className="mt-1 font-semibold">{selectedAnyDeskType || 'Selecione acima'}</p>
                        </div>
                    </div>

                    {anyDeskErrorMessage && (
                        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                            {anyDeskErrorMessage}
                        </div>
                    )}

                    <div>
                        <label htmlFor="online-anydesk-code" className="text-sm font-semibold text-gray-700">
                            Codigo AnyDesk
                        </label>
                        <input
                            id="online-anydesk-code"
                            type="text"
                            value={anyDeskCodeDraft}
                            onChange={(event) => setAnyDeskCodeDraft(applyAnyDeskCodeMask(event.target.value))}
                            placeholder="1 186 429 402"
                            inputMode="numeric"
                            disabled={loadingAnyDesk || !selectedAnyDeskType}
                            className="mt-2 w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm text-gray-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:bg-gray-100"
                        />
                        <p className="mt-2 text-xs text-gray-500">
                            {loadingAnyDesk
                                ? 'Carregando codigo da loja...'
                                : anyDeskData?.code
                                  ? 'Codigo carregado. Voce pode atualizar se necessario.'
                                  : 'Nenhum codigo cadastrado para esta loja/tipo. Informe e salve para criar.'}
                        </p>
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs text-gray-500">
                            {selectedUser
                                ? `O codigo sera enviado para ${selectedUser.name}.`
                                : 'Selecione um usuario no bate-papo para habilitar o envio.'}
                        </p>
                        <div className="flex items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={closeAnyDeskModal}
                                disabled={savingAnyDesk || sendingAnyDesk}
                                className="rounded-full border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:border-blue-400 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                Fechar
                            </button>
                            <PrimaryButton
                                type="submit"
                                disabled={!selectedAnyDeskType || loadingAnyDesk || savingAnyDesk || sendingAnyDesk}
                                className="rounded-full px-4 py-2 text-sm normal-case tracking-normal"
                            >
                                {savingAnyDesk ? 'Salvando...' : 'Atualizar dados'}
                            </PrimaryButton>
                            <PrimaryButton
                                type="button"
                                onClick={handleSendAnyDesk}
                                disabled={!selectedUser || !selectedAnyDeskType || loadingAnyDesk || savingAnyDesk || sendingAnyDesk}
                                className="rounded-full px-4 py-2 text-sm normal-case tracking-normal"
                            >
                                {sendingAnyDesk ? 'Enviando...' : 'Enviar no bate-papo'}
                            </PrimaryButton>
                        </div>
                    </div>
                </form>
            </Modal>
        </AuthenticatedLayout>
    );
}
