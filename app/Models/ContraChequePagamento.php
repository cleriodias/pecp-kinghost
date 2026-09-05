<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ContraChequePagamento extends Model
{
    use HasFactory;

    protected $table = 'tb29_contra_cheque_pagamentos';

    protected $primaryKey = 'tb29_id';

    protected $fillable = [
        'user_id',
        'tb29_registrado_por',
        'tb29_periodo_inicio',
        'tb29_periodo_fim',
        'tb29_data_pagamento',
    ];

    protected $casts = [
        'user_id' => 'integer',
        'tb29_registrado_por' => 'integer',
        'tb29_periodo_inicio' => 'date',
        'tb29_periodo_fim' => 'date',
        'tb29_data_pagamento' => 'date',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function registeredBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'tb29_registrado_por');
    }
}
