<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Venda extends Model
{
    use HasFactory;

    protected $table = 'tb3_vendas';

    protected $primaryKey = 'tb3_id';

    protected $fillable = [
        'tb4_id',
        'tb1_id',
        'id_comanda',
        'produto_nome',
        'valor_unitario',
        'quantidade',
        'valor_total',
        'data_hora',
        'id_user_caixa',
        'id_user_vale',
        'id_lanc',
        'id_unidade',
        'tipo_pago',
        'status_pago',
        'status',
    ];

    protected $casts = [
        'valor_unitario' => 'float',
        'valor_total' => 'float',
        'quantidade' => 'integer',
        'data_hora' => 'datetime',
        'status_pago' => 'boolean',
        'status' => 'integer',
    ];

    public function pagamento(): BelongsTo
    {
        return $this->belongsTo(VendaPagamento::class, 'tb4_id', 'tb4_id');
    }

    public function produto(): BelongsTo
    {
        return $this->belongsTo(Produto::class, 'tb1_id', 'tb1_id');
    }

    public function caixa(): BelongsTo
    {
        return $this->belongsTo(User::class, 'id_user_caixa');
    }

    public function valeUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'id_user_vale');
    }

    public function unidade(): BelongsTo
    {
        return $this->belongsTo(Unidade::class, 'id_unidade', 'tb2_id');
    }
}
