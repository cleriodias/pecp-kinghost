<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ContraChequeCredito extends Model
{
    use HasFactory;

    protected $table = 'tb28_contra_cheque_creditos';

    protected $primaryKey = 'tb28_id';

    protected $fillable = [
        'user_id',
        'tb28_periodo_inicio',
        'tb28_periodo_fim',
        'tb28_tipo',
        'tb28_descricao',
        'tb28_valor',
    ];

    protected $casts = [
        'user_id' => 'integer',
        'tb28_periodo_inicio' => 'date',
        'tb28_periodo_fim' => 'date',
        'tb28_valor' => 'float',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
