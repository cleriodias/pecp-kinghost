import AlertMessage from '@/Components/Alert/AlertMessage';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { formatBrazilDateTime } from '@/Utils/date';
import { getSupportTicketStatusStyle } from '@/Utils/supportTicketStatus';
import { Head, router, useForm, usePage } from '@inertiajs/react';
import { useEffect, useMemo, useRef, useState } from 'react';

const preferredMimeTypes = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];

const formatFileSize = (value) => {
    const size = Number(value ?? 0);
    if (!Number.isFinite(size) || size <= 0) return '0 B';
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const resolveMimeType = () => {
    if (typeof MediaRecorder === 'undefined') return '';
    return preferredMimeTypes.find((type) => (
        typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(type)
    )) ?? '';
};

const resolveExtension = (mimeType) => ((mimeType ?? '').includes('mp4') ? 'mp4' : 'webm');

const Badge = ({ status, label }) => (
    <span
        className="rounded-full border px-3 py-1 text-[11px] font-semibold uppercase"
        style={getSupportTicketStatusStyle(status)}
    >
        {label}
    </span>
);

export default function TicketIndex({ isMaster = false, tickets = [], activeUnit = null, maxUploadMb = 40, maxImageUploadMb = 10, statusOptions = [] }) {
    const { flash, auth } = usePage().props;
    const authUser = auth?.user ?? null;
    const [selectedTicketId, setSelectedTicketId] = useState(tickets[0]?.id ?? null);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [recordingError, setRecordingError] = useState('');
    const [isRecording, setIsRecording] = useState(false);

    const createForm = useForm({ title: '', description: '', recording_file: null });
    const replyForm = useForm({ message: '', images: [] });
    const statusForm = useForm({ status: statusOptions[0]?.value ?? 'aberto' });

    const recorderRef = useRef(null);
    const streamRef = useRef(null);
    const chunksRef = useRef([]);
    const previewRef = useRef(null);

    const selectedTicket = useMemo(
        () => tickets.find((ticket) => ticket.id === selectedTicketId) ?? tickets[0] ?? null,
        [selectedTicketId, tickets],
    );
    const canRecord = useMemo(
        () => typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && !!navigator?.mediaDevices?.getDisplayMedia,
        [],
    );
    const isOwner = selectedTicket && Number(selectedTicket.user?.id ?? 0) === Number(authUser?.id ?? 0);
    const canInteract = Boolean(selectedTicket) && (isMaster || isOwner);

    const stopTracks = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }
    };

    const clearPreview = () => {
        setPreviewUrl((url) => {
            if (url) URL.revokeObjectURL(url);
            return null;
        });
    };

    useEffect(() => {
        if (tickets.length > 0 && !tickets.some((ticket) => ticket.id === selectedTicketId)) {
            setSelectedTicketId(tickets[0].id);
        }
    }, [selectedTicketId, tickets]);

    useEffect(() => {
        previewRef.current = previewUrl;
    }, [previewUrl]);

    useEffect(() => {
        if (selectedTicket?.status) statusForm.setData('status', selectedTicket.status);
    }, [selectedTicket?.id, selectedTicket?.status]);

    useEffect(() => () => {
        stopTracks();
        if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    }, []);

    const finalizeRecording = () => {
        const blob = new Blob(chunksRef.current, { type: recorderRef.current?.mimeType || 'video/webm' });
        chunksRef.current = [];
        recorderRef.current = null;
        stopTracks();
        setIsRecording(false);

        if (blob.size <= 0) {
            setRecordingError('A gravacao foi encerrada sem gerar video valido.');
            createForm.setData('recording_file', null);
            clearPreview();
            return;
        }

        const file = new File([blob], `chamado-${new Date().toISOString().replace(/[:.]/g, '-')}.${resolveExtension(blob.type)}`, {
            type: blob.type || 'video/webm',
        });

        clearPreview();
        setPreviewUrl(URL.createObjectURL(blob));
        createForm.setData('recording_file', file);
    };

    const handleStartRecording = async () => {
        setRecordingError('');
        if (!canRecord) {
            setRecordingError('Seu navegador nao suporta gravacao de tela por esta tela.');
            return;
        }

        try {
            clearPreview();
            createForm.setData('recording_file', null);
            chunksRef.current = [];

            const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: true });
            streamRef.current = stream;

            const mimeType = resolveMimeType();
            const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
            recorderRef.current = recorder;
            recorder.ondataavailable = (event) => {
                if (event.data?.size > 0) chunksRef.current.push(event.data);
            };
            recorder.onstop = finalizeRecording;
            recorder.onerror = () => {
                setRecordingError('Nao foi possivel concluir a gravacao da tela.');
                setIsRecording(false);
                stopTracks();
            };
            stream.getVideoTracks().forEach((track) => track.addEventListener('ended', () => {
                if (recorder.state !== 'inactive') recorder.stop();
            }));

            recorder.start(1000);
            setIsRecording(true);
        } catch (error) {
            stopTracks();
            setIsRecording(false);
            setRecordingError('A gravacao de tela foi cancelada ou bloqueada pelo navegador.');
        }
    };

    const handleCreate = (event) => {
        event.preventDefault();
        createForm.post(route('support.tickets.store'), {
            preserveScroll: true,
            forceFormData: true,
            onSuccess: () => {
                createForm.reset('title', 'description', 'recording_file');
                clearPreview();
                setRecordingError('');
            },
        });
    };

    const handleReply = (event) => {
        event.preventDefault();
        if (!selectedTicket) return;
        replyForm.post(route('support.tickets.reply', selectedTicket.id), {
            preserveScroll: true,
            forceFormData: true,
            onSuccess: () => replyForm.reset('message', 'images'),
        });
    };

    const handleStatus = (event) => {
        event.preventDefault();
        if (!selectedTicket || !isMaster) return;
        statusForm.put(route('support.tickets.update-status', selectedTicket.id), { preserveScroll: true });
    };

    const handleDelete = () => {
        if (!selectedTicket || !isMaster) return;
        if (!window.confirm(`Confirma excluir o chamado #${selectedTicket.id}?`)) return;
        router.delete(route('support.tickets.destroy', selectedTicket.id), { preserveScroll: true });
    };

    return (
        <AuthenticatedLayout
            header={(
                <div className="flex flex-col gap-1">
                    <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200">Chamados com gravacao</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-300">O autor acompanha o proprio chamado e o master pode responder, anexar imagens, mudar status e excluir.</p>
                    <p className="text-sm text-gray-500 dark:text-gray-300">Unidade ativa: <span className="font-semibold text-gray-700 dark:text-gray-200">{activeUnit?.name ?? '--'}</span></p>
                </div>
            )}
        >
            <Head title="Chamados" />

            <div className="py-8">
                <div className="mx-auto max-w-7xl space-y-6 px-4 sm:px-6 lg:px-8">
                    <AlertMessage message={flash} />

                    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                        <div className="space-y-6">
                            <div className="rounded-2xl bg-white p-6 shadow dark:bg-gray-800">
                                <form onSubmit={handleCreate} className="space-y-4">
                                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                                        Video inicial: ate {maxUploadMb} MB. Imagens do master: ate {maxImageUploadMb} MB por arquivo.
                                    </div>
                                    <div>
                                        <label className="text-sm font-semibold text-gray-700 dark:text-gray-200">Titulo</label>
                                        <input
                                            type="text"
                                            value={createForm.data.title}
                                            onChange={(event) => createForm.setData('title', event.target.value)}
                                            className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                        />
                                        {createForm.errors.title && <p className="mt-1 text-sm text-red-600">{createForm.errors.title}</p>}
                                    </div>
                                    <div>
                                        <label className="text-sm font-semibold text-gray-700 dark:text-gray-200">Descricao</label>
                                        <textarea
                                            rows={4}
                                            value={createForm.data.description}
                                            onChange={(event) => createForm.setData('description', event.target.value)}
                                            className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                        />
                                        {createForm.errors.description && <p className="mt-1 text-sm text-red-600">{createForm.errors.description}</p>}
                                    </div>
                                    <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-4 dark:border-gray-600 dark:bg-gray-900/40">
                                        <div className="flex flex-wrap gap-3">
                                            <button type="button" onClick={handleStartRecording} disabled={isRecording} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Iniciar gravacao</button>
                                            <button type="button" onClick={() => recorderRef.current?.state !== 'inactive' && recorderRef.current?.stop()} disabled={!isRecording} className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Finalizar gravacao</button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (isRecording && recorderRef.current?.state !== 'inactive') recorderRef.current.stop();
                                                    setRecordingError('');
                                                    createForm.setData('recording_file', null);
                                                    clearPreview();
                                                }}
                                                className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 dark:border-gray-600 dark:text-gray-200"
                                            >
                                                Limpar
                                            </button>
                                        </div>
                                        {recordingError && <p className="mt-3 text-sm font-semibold text-red-600">{recordingError}</p>}
                                        {createForm.errors.recording_file && <p className="mt-3 text-sm font-semibold text-red-600">{createForm.errors.recording_file}</p>}
                                        {isRecording && <p className="mt-3 text-sm font-semibold text-emerald-600">Gravacao em andamento.</p>}
                                        {createForm.data.recording_file && <p className="mt-3 text-sm font-semibold text-gray-700 dark:text-gray-200">{createForm.data.recording_file.name} ({formatFileSize(createForm.data.recording_file.size)})</p>}
                                    </div>
                                    {previewUrl && <video src={previewUrl} controls className="w-full rounded-2xl border border-gray-200 bg-black shadow dark:border-gray-700" />}
                                    <div className="flex justify-end">
                                        <button type="submit" disabled={createForm.processing || isRecording || !createForm.data.recording_file} className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
                                            {createForm.processing ? 'Enviando...' : 'Enviar chamado'}
                                        </button>
                                    </div>
                                </form>
                            </div>

                            <div className="rounded-2xl bg-white p-6 shadow dark:bg-gray-800">
                                <div className="flex items-center justify-between gap-3">
                                    <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">{isMaster ? 'Todos os chamados' : 'Meus chamados'}</h3>
                                    <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-100">{tickets.length} chamado(s)</span>
                                </div>
                                <div className="mt-4 space-y-3">
                                    {tickets.length > 0 ? tickets.map((ticket) => (
                                        <button
                                            key={ticket.id}
                                            type="button"
                                            onClick={() => setSelectedTicketId(ticket.id)}
                                            className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                                                selectedTicket?.id === ticket.id
                                                    ? 'border-indigo-500 bg-indigo-50 dark:border-indigo-400 dark:bg-indigo-900/30'
                                                    : 'border-gray-200 bg-white hover:border-indigo-300 dark:border-gray-700 dark:bg-gray-900'
                                            }`}
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{ticket.title}</p>
                                                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-300">{ticket.user?.name ?? '--'} | {ticket.unit?.name ?? '--'}</p>
                                                </div>
                                                <div className="flex flex-col items-end gap-2">
                                                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-300">#{ticket.id}</span>
                                                    <Badge status={ticket.status} label={ticket.status_label} />
                                                </div>
                                            </div>
                                        </button>
                                    )) : <p className="text-sm text-gray-500 dark:text-gray-300">Nenhum chamado encontrado.</p>}
                                </div>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <div className="rounded-2xl bg-white p-6 shadow dark:bg-gray-800">
                                {selectedTicket ? (
                                    <div className="space-y-5">
                                        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/40">
                                            <div className="flex flex-wrap items-start justify-between gap-3">
                                                <div>
                                                    <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">{selectedTicket.title}</h3>
                                                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-300">Aberto por {selectedTicket.user?.name ?? '--'} | Unidade {selectedTicket.unit?.name ?? '--'}</p>
                                                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-300">{formatBrazilDateTime(selectedTicket.created_at)} | Video {formatFileSize(selectedTicket.video_size)}</p>
                                                </div>
                                                <Badge status={selectedTicket.status} label={selectedTicket.status_label} />
                                            </div>
                                            {selectedTicket.description && <p className="mt-4 text-sm text-gray-700 dark:text-gray-200">{selectedTicket.description}</p>}
                                        </div>

                                        {isMaster && (
                                            <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-gray-200 p-4 dark:border-gray-700">
                                                <form onSubmit={handleStatus} className="flex flex-1 flex-wrap items-end gap-3">
                                                    <div className="min-w-56 flex-1">
                                                        <label className="text-sm font-semibold text-gray-700 dark:text-gray-200">Status</label>
                                                        <select value={statusForm.data.status} onChange={(event) => statusForm.setData('status', event.target.value)} className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
                                                            {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                                                        </select>
                                                        {statusForm.errors.status && <p className="mt-1 text-sm text-red-600">{statusForm.errors.status}</p>}
                                                    </div>
                                                    <button type="submit" disabled={statusForm.processing} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Atualizar status</button>
                                                </form>
                                                <button type="button" onClick={handleDelete} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white">Excluir chamado</button>
                                            </div>
                                        )}

                                        <video key={selectedTicket.id} src={selectedTicket.video_url} controls className="w-full rounded-2xl border border-gray-200 bg-black shadow dark:border-gray-700" />
                                    </div>
                                ) : <p className="text-sm text-gray-500 dark:text-gray-300">Selecione um chamado para ver os detalhes.</p>}
                            </div>

                            {selectedTicket && (
                                <div className="rounded-2xl bg-white p-6 shadow dark:bg-gray-800">
                                    <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Historico</h3>
                                    <div className="mt-4 space-y-4">
                                        <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-500/30 dark:bg-indigo-900/20">
                                            <div className="flex flex-wrap items-center justify-between gap-3">
                                                <p className="text-sm font-semibold text-indigo-800 dark:text-indigo-100">Abertura do chamado</p>
                                                <span className="text-xs text-indigo-700 dark:text-indigo-200">{formatBrazilDateTime(selectedTicket.created_at)}</span>
                                            </div>
                                            <p className="mt-2 text-sm text-indigo-900 dark:text-indigo-100">{selectedTicket.description || 'Chamado aberto com gravacao de tela.'}</p>
                                        </div>

                                        {selectedTicket.interactions.length > 0 ? selectedTicket.interactions.map((interaction) => (
                                            <div key={interaction.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/40">
                                                <div className="flex flex-wrap items-center justify-between gap-3">
                                                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{interaction.author_name}</p>
                                                    <span className="text-xs text-gray-500 dark:text-gray-300">{formatBrazilDateTime(interaction.created_at)}</span>
                                                </div>
                                                {interaction.message && <p className="mt-3 whitespace-pre-line text-sm text-gray-700 dark:text-gray-200">{interaction.message}</p>}
                                                {interaction.attachments.length > 0 && (
                                                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                                        {interaction.attachments.map((attachment) => (
                                                            <a key={attachment.id} href={attachment.url} target="_blank" rel="noreferrer" className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-900">
                                                                <img src={attachment.url} alt={attachment.original_name} className="h-40 w-full rounded-xl object-cover" />
                                                                <p className="mt-2 text-xs font-semibold text-gray-700 dark:text-gray-200">{attachment.original_name}</p>
                                                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-300">{formatFileSize(attachment.file_size)}</p>
                                                            </a>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )) : <p className="text-sm text-gray-500 dark:text-gray-300">Ainda nao existem interacoes adicionais.</p>}
                                    </div>
                                </div>
                            )}

                            {selectedTicket && canInteract && (
                                <div className="rounded-2xl bg-white p-6 shadow dark:bg-gray-800">
                                    <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Nova interacao</h3>
                                    <form onSubmit={handleReply} className="mt-4 space-y-4">
                                        <div>
                                            <label className="text-sm font-semibold text-gray-700 dark:text-gray-200">Mensagem</label>
                                            <textarea
                                                rows={4}
                                                value={replyForm.data.message}
                                                onChange={(event) => replyForm.setData('message', event.target.value)}
                                                className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                            />
                                            {replyForm.errors.message && <p className="mt-1 text-sm text-red-600">{replyForm.errors.message}</p>}
                                        </div>

                                        {isMaster && (
                                            <div>
                                                <label className="text-sm font-semibold text-gray-700 dark:text-gray-200">Imagens anexas</label>
                                                <input
                                                    type="file"
                                                    multiple
                                                    accept=".png,.jpg,.jpeg,.bmp,.gif,.webp,image/*"
                                                    onChange={(event) => replyForm.setData('images', Array.from(event.target.files ?? []))}
                                                    className="mt-2 block w-full text-sm text-gray-700 dark:text-gray-200"
                                                />
                                                {replyForm.data.images.length > 0 && (
                                                    <div className="mt-2 space-y-1">
                                                        {replyForm.data.images.map((image) => <p key={`${image.name}-${image.size}`} className="text-xs text-gray-600 dark:text-gray-300">{image.name} ({formatFileSize(image.size)})</p>)}
                                                    </div>
                                                )}
                                                {(replyForm.errors.images || replyForm.errors['images.0']) && (
                                                    <p className="mt-1 text-sm text-red-600">{replyForm.errors.images || replyForm.errors['images.0']}</p>
                                                )}
                                            </div>
                                        )}

                                        <div className="flex justify-end">
                                            <button type="submit" disabled={replyForm.processing} className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
                                                {replyForm.processing ? 'Salvando...' : 'Registrar interacao'}
                                            </button>
                                        </div>
                                    </form>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
