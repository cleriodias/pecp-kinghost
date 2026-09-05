<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tb26_configuracoes_fiscais', function (Blueprint $table) {
            $table->text('tb26_certificado_senha_compartilhada')->nullable()->after('tb26_certificado_senha');
        });

        DB::table('tb26_configuracoes_fiscais')
            ->select(['tb26_id', 'tb26_certificado_senha', 'tb26_certificado_senha_compartilhada'])
            ->orderBy('tb26_id')
            ->get()
            ->each(function (object $configuration): void {
                if (filled($configuration->tb26_certificado_senha_compartilhada) || blank($configuration->tb26_certificado_senha)) {
                    return;
                }

                try {
                    $decryptedPassword = trim((string) Crypt::decryptString((string) $configuration->tb26_certificado_senha));

                    if ($decryptedPassword === '') {
                        return;
                    }

                    DB::table('tb26_configuracoes_fiscais')
                        ->where('tb26_id', (int) $configuration->tb26_id)
                        ->update([
                            'tb26_certificado_senha_compartilhada' => $decryptedPassword,
                        ]);
                } catch (\Throwable) {
                    // Mantem o valor antigo intacto quando nao for possivel descriptografar neste ambiente.
                }
            });
    }

    public function down(): void
    {
        Schema::table('tb26_configuracoes_fiscais', function (Blueprint $table) {
            $table->dropColumn('tb26_certificado_senha_compartilhada');
        });
    }
};
