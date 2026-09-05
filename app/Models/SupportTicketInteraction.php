<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SupportTicketInteraction extends Model
{
    use HasFactory;

    protected $table = 'tb19_chamado_interacoes';

    protected $fillable = [
        'support_ticket_id',
        'user_id',
        'author_name',
        'message',
    ];

    protected $casts = [
        'support_ticket_id' => 'integer',
        'user_id' => 'integer',
    ];

    public function supportTicket(): BelongsTo
    {
        return $this->belongsTo(SupportTicket::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function attachments(): HasMany
    {
        return $this->hasMany(SupportTicketAttachment::class, 'support_ticket_interaction_id');
    }
}
