import { useForm } from "@inertiajs/react";
import React from "react";
import DangerButton from "../Button/DangerButton";

function ConfirmDeleteButton({ id, routeName }){
    const { delete: destroy } = useForm();

    const handleDelete = () => {
        if(window.confirm("Tem certeza que deseja deletar este registro!")){
            destroy(route(routeName, id));
        }
    }

    return (
        <DangerButton
            className="ms-1 text-sm"
            onClick={handleDelete}
            aria-label="Apagar"
            title="Apagar"
        >
            <i className="bi bi-trash text-lg" aria-hidden="true"></i>
        </DangerButton>
    )
}
export default ConfirmDeleteButton;
