<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ControlePagamento extends Model
{
    use HasFactory;

    protected $table = 'tb24_controle_pagamentos';

    protected $fillable = [
        'user_id',
        'descricao',
        'frequencia',
        'dia_semana',
        'dia_mes',
        'valor_total',
        'quantidade_parcelas',
        'valor_parcela',
        'data_inicio',
        'data_fim',
    ];

    protected $casts = [
        'user_id' => 'integer',
        'dia_semana' => 'integer',
        'dia_mes' => 'integer',
        'valor_total' => 'float',
        'quantidade_parcelas' => 'integer',
        'valor_parcela' => 'float',
        'data_inicio' => 'date',
        'data_fim' => 'date',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
