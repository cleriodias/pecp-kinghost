import AlertMessage from '@/Components/Alert/AlertMessage';
import InputError from '@/Components/InputError';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, useForm, usePage } from '@inertiajs/react';
import { useRef } from 'react';

const FORMAT_ACTIONS = [
    { label: 'Negrito', icon: 'bi-type-bold', before: '*', after: '*' },
    { label: 'Italico', icon: 'bi-type-italic', before: '_', after: '_' },
    { label: 'Tachado', icon: 'bi-type-strikethrough', before: '~', after: '~' },
    { label: 'Mono', icon: 'bi-code-slash', before: '```', after: '```' },
];

const NAME_TOKEN = '{{nome}}';

const buildPreview = (template, name) =>
    template.replace(/{{nome}}|{{name}}|{nome}|{name}/g, name);

export default function Notices({ auth, recipientsCount = 0, sampleRecipients = [] }) {
    const { flash } = usePage().props;
    const textareaRef = useRef(null);
    const { data, setData, post, processing, errors, reset } = useForm({
        message: '',
    });

    const previewName = sampleRecipients[0]?.name || 'Cliente';
    const previewMessage = data.message ? buildPreview(data.message, previewName) : '';

    const applyFormat = (before, after = before) => {
        const target = textareaRef.current;
        if (!target) {
            return;
        }
        const { selectionStart, selectionEnd } = target;
        const value = data.message || '';
        const selected = value.slice(selectionStart, selectionEnd);
        const nextValue =
            value.slice(0, selectionStart) + before + selected + after + value.slice(selectionEnd);
        const cursorStart = selectionStart + before.length;
        const cursorEnd = cursorStart + selected.length;

        setData('message', nextValue);
        requestAnimationFrame(() => {
            if (textareaRef.current) {
                textareaRef.current.focus();
                textareaRef.current.setSelectionRange(cursorStart, cursorEnd);
            }
        });
    };

    const insertToken = (token) => {
        const target = textareaRef.current;
        if (!target) {
            return;
        }
        const { selectionStart, selectionEnd } = target;
        const value = data.message || '';
        const nextValue = value.slice(0, selectionStart) + token + value.slice(selectionEnd);
        const cursor = selectionStart + token.length;

        setData('message', nextValue);
        requestAnimationFrame(() => {
            if (textareaRef.current) {
                textareaRef.current.focus();
                textareaRef.current.setSelectionRange(cursor, cursor);
            }
        });
    };

    const handleSubmit = (event) => {
        event.preventDefault();
        post(route('settings.notices.store'), {
            preserveScroll: true,
            onSuccess: () => reset(),
        });
    };

    return (
        <AuthenticatedLayout
            user={auth.user}
            header={
                <div className="flex flex-col gap-1">
                    <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
                        Avisos
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-300">
                        Envie mensagens do WhatsApp para todos os contatos cadastrados.
                    </p>
                </div>
            }
        >
            <Head title="Avisos" />
            <div className="py-8">
                <div className="mx-auto max-w-6xl space-y-6 px-4 sm:px-6 lg:px-8">
                    <AlertMessage message={flash} />
                    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
                        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
                            <h3 className="text-sm font-semibold uppercase text-gray-600 dark:text-gray-300">
                                Mensagem
                            </h3>
                            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                                <div className="flex flex-wrap gap-2">
                                    {FORMAT_ACTIONS.map((action) => (
                                        <button
                                            key={action.label}
                                            type="button"
                                            onClick={() => applyFormat(action.before, action.after)}
                                            className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-semibold text-gray-700 transition hover:border-indigo-300 hover:text-indigo-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                                        >
                                            <i className={`bi ${action.icon}`} aria-hidden="true"></i>
                                            {action.label}
                                        </button>
                                    ))}
                                    <button
                                        type="button"
                                        onClick={() => insertToken(NAME_TOKEN)}
                                        className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300 dark:border-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-200"
                                    >
                                        <i className="bi bi-person-plus" aria-hidden="true"></i>
                                        Nome
                                    </button>
                                </div>

                                <div>
                                    <textarea
                                        ref={textareaRef}
                                        rows={8}
                                        value={data.message}
                                        onChange={(event) => setData('message', event.target.value)}
                                        placeholder="Escreva a mensagem aqui..."
                                        className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                                    />
                                    <InputError message={errors.message} className="mt-2" />
                                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-300">
                                        Dica: use *negrito* _italico_ ~tachado~ ```mono``` e {NAME_TOKEN} para o nome.
                                    </p>
                                </div>

                                <div className="flex items-center justify-between gap-3">
                                    <p className="text-sm text-gray-500 dark:text-gray-300">
                                        Destinatarios: {recipientsCount}
                                    </p>
                                    <button
                                        type="submit"
                                        disabled={processing || recipientsCount === 0}
                                        className="inline-flex items-center justify-center rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        Enviar avisos
                                    </button>
                                </div>
                            </form>
                        </div>

                        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
                            <h3 className="text-sm font-semibold uppercase text-gray-600 dark:text-gray-300">
                                Destinatarios
                            </h3>
                            <div className="mt-4 space-y-4 text-sm text-gray-600 dark:text-gray-200">
                                <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-800/60">
                                    <p className="text-xs font-semibold uppercase text-gray-500">Preview</p>
                                    <p className="mt-2 whitespace-pre-line text-sm text-gray-700 dark:text-gray-100">
                                        {previewMessage || 'Digite a mensagem para ver o preview.'}
                                    </p>
                                    <p className="mt-2 text-xs text-gray-500">
                                        Nome usado no preview: {previewName}
                                    </p>
                                </div>

                                <div>
                                    <p className="text-xs font-semibold uppercase text-gray-500">
                                        Exemplos de contatos
                                    </p>
                                    {sampleRecipients.length ? (
                                        <ul className="mt-2 space-y-2">
                                            {sampleRecipients.map((recipient) => (
                                                <li
                                                    key={`${recipient.name}-${recipient.phone}`}
                                                    className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 text-xs text-gray-600 dark:border-gray-800 dark:text-gray-300"
                                                >
                                                    <span className="font-semibold text-gray-700 dark:text-gray-100">
                                                        {recipient.name}
                                                    </span>
                                                    <span>{recipient.phone}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p className="mt-2 text-xs text-gray-500">
                                            Nenhum contato cadastrado.
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
