<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\Relations\HasMany;

class VendaPagamento extends Model
{
    use HasFactory;

    protected $table = 'tb4_vendas_pg';

    protected $primaryKey = 'tb4_id';

    protected $fillable = [
        'valor_total',
        'tipo_pagamento',
        'valor_pago',
        'troco',
        'dois_pgto',
    ];

    protected $casts = [
        'valor_total' => 'float',
        'valor_pago' => 'float',
        'troco' => 'float',
        'dois_pgto' => 'float',
    ];

    public function vendas(): HasMany
    {
        return $this->hasMany(Venda::class, 'tb4_id', 'tb4_id');
    }

    public function notaFiscal(): HasOne
    {
        return $this->hasOne(NotaFiscal::class, 'tb4_id', 'tb4_id');
    }
}
