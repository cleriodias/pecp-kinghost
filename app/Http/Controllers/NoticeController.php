<?php

namespace App\Http\Controllers;

use App\Models\NewsletterNotice;
use App\Models\NewsletterSubscription;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class NoticeController extends Controller
{
    private const NAME_TOKENS = ['{{nome}}', '{{name}}', '{nome}', '{name}'];

    private function ensureAuthorized(Request $request): void
    {
        $user = $request->user();

        if (! $user || (int) $user->funcao !== 0) {
            abort(403, 'Acesso negado.');
        }
    }

    private function resolveTwilioConfig(): array
    {
        return [
            'sid' => config('services.twilio.sid'),
            'token' => config('services.twilio.token'),
            'from' => config('services.twilio.whatsapp_from'),
        ];
    }

    private function normalizeWhatsappFrom(?string $value): ?string
    {
        $digits = preg_replace('/\D/', '', (string) $value);

        if ($digits === '') {
            return null;
        }

        return 'whatsapp:+' . $digits;
    }

    private function normalizeWhatsappTo(?string $value): ?string
    {
        $digits = preg_replace('/\D/', '', (string) $value);

        if ($digits === '') {
            return null;
        }

        if (strlen($digits) === 10 || strlen($digits) === 11) {
            $digits = '55' . $digits;
        }

        return 'whatsapp:+' . $digits;
    }

    private function sendWhatsappMessage(array $config, string $to, string $body): array
    {
        $url = 'https://api.twilio.com/2010-04-01/Accounts/' . $config['sid'] . '/Messages.json';

        $response = Http::timeout(15)
            ->asForm()
            ->withBasicAuth($config['sid'], $config['token'])
            ->post($url, [
                'From' => $config['from'],
                'To' => $to,
                'Body' => $body,
            ]);

        if ($response->successful()) {
            return [
                'ok' => true,
                'sid' => $response->json('sid'),
            ];
        }

        $error = $response->json('message')
            ?? $response->json('error_message')
            ?? $response->body();

        return [
            'ok' => false,
            'error' => is_string($error) ? $error : 'Falha ao enviar mensagem.',
        ];
    }

    private function formatFailureSummary(array $failures): string
    {
        if (empty($failures)) {
            return '';
        }

        $preview = array_slice($failures, 0, 3);

        return ' Ex: ' . implode(' | ', $preview);
    }

    public function index(Request $request): Response
    {
        $this->ensureAuthorized($request);

        $recipientsCount = NewsletterSubscription::count();
        $sampleRecipients = NewsletterSubscription::orderBy('name')
            ->limit(5)
            ->get(['name', 'phone']);

        return Inertia::render('Settings/Notices', [
            'recipientsCount' => $recipientsCount,
            'sampleRecipients' => $sampleRecipients,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $this->ensureAuthorized($request);

        $data = $request->validate(
            [
                'message' => 'required|string|max:2000',
            ],
            [
                'message.required' => 'Informe a mensagem.',
            ]
        );

        $template = trim($data['message']);

        if (! Str::contains($template, self::NAME_TOKENS)) {
            throw ValidationException::withMessages([
                'message' => 'Inclua {{nome}} na mensagem para personalizar.',
            ]);
        }

        $recipients = NewsletterSubscription::orderBy('name')->get(['id', 'name', 'phone']);

        if ($recipients->isEmpty()) {
            return back()->with('error', 'Nenhum contato cadastrado.');
        }

        $twilio = $this->resolveTwilioConfig();
        $twilio['from'] = $this->normalizeWhatsappFrom($twilio['from'] ?? null);

        if (! $twilio['sid'] || ! $twilio['token'] || ! $twilio['from']) {
            return back()->with(
                'error',
                'Configure TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN e TWILIO_WHATSAPP_FROM no .env.'
            );
        }

        $now = now();
        $payload = [];
        $successCount = 0;
        $failures = [];

        foreach ($recipients as $recipient) {
            $personalized = str_replace(self::NAME_TOKENS, $recipient->name, $template);
            $to = $this->normalizeWhatsappTo($recipient->phone);

            if (! $to) {
                $failures[] = $recipient->name . ': telefone invalido.';
            } else {
                $result = $this->sendWhatsappMessage($twilio, $to, $personalized);
                if ($result['ok']) {
                    $successCount++;
                } else {
                    $failures[] = $recipient->name . ': ' . $result['error'];
                }
            }

            $payload[] = [
                'newsletter_subscription_id' => $recipient->id,
                'name' => $recipient->name,
                'phone' => $recipient->phone,
                'message' => $personalized,
                'created_at' => $now,
                'updated_at' => $now,
            ];
        }

        NewsletterNotice::insert($payload);

        if (! empty($failures)) {
            Log::warning('Twilio notice send failures', [
                'count' => count($failures),
                'details' => array_slice($failures, 0, 10),
            ]);
        }

        if ($successCount === 0) {
            return back()->with(
                'error',
                'Falha ao enviar avisos.' . $this->formatFailureSummary($failures)
            );
        }

        $message = 'Avisos enviados: ' . $successCount . '.';
        if (! empty($failures)) {
            $message .= ' Falhas: ' . count($failures) . '. Confira o log.';
        }

        return back()->with('success', $message);
    }
}
