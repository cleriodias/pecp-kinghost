import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head } from '@inertiajs/react';
import UpdateProfileInformationForm from './partials/UpdateProfileInformationForm';
import UpdatePasswordForm from './partials/UpdatePasswordForm';
import UpdateAccessCodeForm from './partials/UpdateAccessCodeForm';
import DeleteUserForm from './partials/DeleteUserForm';

export default function Edit({ mustVerifyEmail, status }) {
    return (
        <AuthenticatedLayout
            header={
                <h2 className="text-xl font-semibold leading-tight text-gray-800">
                    Perfil
                </h2>
            }
        >
            <Head title="Perfil" />

            <div className="min-h-screen bg-gray-100 py-12 text-gray-900">
                <div className="mx-auto w-full max-w-4xl space-y-8 px-4 sm:px-0">
                    <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-md">
                        <UpdateProfileInformationForm className="w-full" />
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-md">
                        <UpdatePasswordForm className="w-full" />
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-md">
                        <UpdateAccessCodeForm className="w-full" />
                    </div>

                    <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-md">
                        <DeleteUserForm className="w-full" />
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
