<?php

namespace App\Http\Controllers;

use App\Models\NewsletterSubscription;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

class NewsletterSubscriptionController extends Controller
{
    public function store(Request $request): RedirectResponse
    {
        $request->merge([
            'phone' => preg_replace('/\D/', '', (string) $request->input('phone')),
        ]);

        $data = $request->validate(
            [
                'name' => 'required|string|max:255',
                'phone' => 'required|digits:11|unique:newsletter_subscriptions,phone',
            ],
            [
                'name.required' => 'Informe o nome.',
                'phone.required' => 'Informe o telefone.',
                'phone.unique' => 'Telefone ja cadastrado.',
                'phone.digits' => 'Informe o telefone com DDD (2 digitos) e numero com 9 digitos.',
            ]
        );

        NewsletterSubscription::create($data);

        return redirect()->back()->with(
            'success',
            'Cadastro recebido. Voce recebera informacoes de produtos feitos na hora.'
        );
    }
}
